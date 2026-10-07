import { chunkText, selectChunk } from "../lib/chunk";
import { generateClozeQuestions, type ClozeQuestion } from "../lib/cloze";
import { extractMainText } from "../lib/extract";
import {
  isWikipediaHost,
  markAutostartOnNextLoad,
  pickRandomWikipediaArticleUrl,
} from "../lib/wikiRandom";
import {
  isOverlayMounted,
  mountOverlay,
  showToast,
  type OverlayHandle,
} from "./overlay";

type SessionState = {
  handle: OverlayHandle;
  passageText: string;
  chunkIndex: number;
  questions: ClozeQuestion[];
  currentIndex: number;
  selections: Record<string, string>;
  results: Record<string, boolean> | null;
  regenerateSalt: string;
};

let session: SessionState | null = null;

function progressLabel(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`;
}

function render(state: SessionState): void {
  state.handle.update({
    passageText: state.passageText,
    questions: state.questions,
    currentIndex: state.currentIndex,
    selections: state.selections,
    results: state.results,
    progressLabel: progressLabel(state.currentIndex, state.questions.length),
  });
}

function buildQuestions(passageText: string, chunkIndex: number, salt: string) {
  return generateClozeQuestions(passageText, location.href, chunkIndex, salt);
}

function startFreshSession(regenerateSalt = ""): void {
  const extracted = extractMainText(document);
  if (!extracted.ok) {
    showToast(extracted.reason);
    return;
  }

  const chunks = chunkText(extracted.text);
  const selection = selectChunk(chunks, location.href, regenerateSalt);
  if (!selection) {
    showToast("Could not build a passage of 200–400 words from this page.");
    return;
  }

  const { chunk } = selection;
  const cloze = buildQuestions(chunk.text, chunk.index, regenerateSalt);

  if (session) {
    session.handle.destroy();
    session = null;
  }

  const handle = mountOverlay({
    showRandomWiki: isWikipediaHost(),
    onExit: () => {
      session?.handle.destroy();
      session = null;
    },
    onCheck: () => {
      if (!session) return;
      const results: Record<string, boolean> = {};
      for (const q of session.questions) {
        results[q.id] = session.selections[q.id] === q.correctOptionId;
      }
      session.results = results;
      render(session);
    },
    onRegenerate: () => {
      startFreshSession(`${Date.now()}`);
    },
    onRandomWiki: () => {
      goToRandomWikipediaArticle();
    },
    onSelectAnswer: (questionId, optionId) => {
      if (!session || session.results) return;
      session.selections[questionId] = optionId;
      render(session);
    },
    onPrev: () => {
      if (!session || session.currentIndex <= 0) return;
      session.currentIndex -= 1;
      render(session);
    },
    onNext: () => {
      if (!session || session.currentIndex >= session.questions.length - 1) return;
      session.currentIndex += 1;
      render(session);
    },
  });

  session = {
    handle,
    passageText: chunk.text,
    chunkIndex: chunk.index,
    questions: cloze.questions,
    currentIndex: 0,
    selections: {},
    results: null,
    regenerateSalt,
  };
  render(session);
}

/** Jump to a random article linked from this Wikipedia page (cold-start). */
export function goToRandomWikipediaArticle(): void {
  if (!isWikipediaHost()) {
    showToast("Random article only works on Wikipedia pages.");
    return;
  }

  const url = pickRandomWikipediaArticleUrl(document);
  if (!url) {
    showToast("No other Wikipedia articles linked from this page.");
    return;
  }

  markAutostartOnNextLoad();
  session?.handle.destroy();
  session = null;
  location.assign(url);
}

/** Start (or restart) practice on the current page. */
export function startPractice(): void {
  if (isOverlayMounted() && session) {
    startFreshSession(`${Date.now()}`);
    return;
  }
  startFreshSession();
}

export function stopPractice(): void {
  session?.handle.destroy();
  session = null;
}

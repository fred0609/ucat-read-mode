/**
 * Local cloze (fill-in-the-blank) question generator.
 * Prefers numbers and proper nouns; blanks first occurrence only;
 * avoids reusing the same sentence when possible.
 */

import { isStopword } from "./stopwords";

export interface ClozeOption {
  id: string;
  text: string;
}

export interface ClozeQuestion {
  id: string;
  /** Stem with "_____" for the blank. */
  prompt: string;
  options: ClozeOption[];
  correctOptionId: string;
  blankWord: string;
}

export interface ClozeSet {
  questions: ClozeQuestion[];
  seed: string;
}

const QUESTION_COUNT = 4;
const MIN_SENTENCE_LEN = 20;
const LIMITED_PREFIX = "Limited text — practice item: ";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) ?? [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNumberToken(token: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(token);
}

/** Capitalized word that looks like a proper noun. */
function isProperNounLike(token: string): boolean {
  if (isNumberToken(token)) return false;
  if (token.length < 2) return false;
  return /^[A-Z][a-zA-Z]+(?:'[A-Za-z]+)?$/.test(token);
}

function isContentToken(token: string): boolean {
  if (isNumberToken(token)) return true;
  if (token.length < 3) return false;
  if (isStopword(token)) return false;
  return true;
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Blank only the first occurrence of `word` in the sentence. */
function blankFirstOccurrence(sentence: string, word: string): string {
  return sentence.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`), "_____");
}

interface RankedCandidate {
  word: string;
  rank: number;
}

function rankCandidates(tokens: string[]): RankedCandidate[] {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (!isContentToken(t)) continue;
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const ranked: RankedCandidate[] = [];

  for (const t of tokens) {
    if (!isContentToken(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const f = freq.get(key) ?? 1;
    let tier: number;
    if (isNumberToken(t)) tier = 0;
    else if (isProperNounLike(t)) tier = 1;
    else tier = 2;

    // Within tier: rarer + longer first (lower score = better)
    ranked.push({
      word: t,
      rank: tier * 10_000 + f * 100 - t.length,
    });
  }

  ranked.sort((a, b) => a.rank - b.rank || b.word.length - a.word.length);
  return ranked;
}

function buildOptions(
  word: string,
  unique: string[],
  questionIndex: number,
  rand: () => number,
  allowPad = false,
): ClozeOption[] | null {
  const key = word.toLowerCase();
  const distractorPool = unique.filter(
    (t) => t.toLowerCase() !== key && Math.abs(t.length - word.length) <= 4,
  );
  shuffleInPlace(distractorPool, rand);

  let distractors = distractorPool.slice(0, 3);
  if (distractors.length < 3) {
    const fallback = unique.filter(
      (t) => t.toLowerCase() !== key && !distractors.includes(t),
    );
    shuffleInPlace(fallback, rand);
    distractors = [...distractors, ...fallback].slice(0, 3);
  }
  if (distractors.length < 3 && allowPad) {
    const pads = ["option", "choice", "answer", "term", "item", "value"].filter(
      (p) => p.toLowerCase() !== key && !distractors.includes(p),
    );
    distractors = [...distractors, ...pads].slice(0, 3);
  }
  if (distractors.length < 3) return null;

  const correctId = `opt-${questionIndex}-c`;
  const options: ClozeOption[] = [
    { id: correctId, text: word },
    ...distractors.map((d, i) => ({ id: `opt-${questionIndex}-d${i}`, text: d })),
  ];
  shuffleInPlace(options, rand);
  return options;
}

function tryMakeQuestion(
  word: string,
  sentences: string[],
  unique: string[],
  usedAnswers: Set<string>,
  usedSentences: Set<string>,
  questionIndex: number,
  rand: () => number,
  opts: {
    markLimited?: boolean;
    allowPadDistractors?: boolean;
    minSentenceLen?: number;
    allowReuseSentence?: boolean;
  } = {},
): { question: ClozeQuestion; sentence: string } | null {
  const {
    markLimited = false,
    allowPadDistractors = false,
    minSentenceLen = MIN_SENTENCE_LEN,
    allowReuseSentence = false,
  } = opts;

  const key = word.toLowerCase();
  if (usedAnswers.has(key)) return null;

  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`);
  let sentence: string | null = null;
  let fallback: string | null = null;
  for (const s of sentences) {
    if (!re.test(s) || s.length < minSentenceLen) continue;
    if (!usedSentences.has(s)) {
      sentence = s;
      break;
    }
    if (allowReuseSentence && !fallback) fallback = s;
  }
  sentence = sentence ?? fallback;
  if (!sentence) return null;

  const options = buildOptions(
    word,
    unique,
    questionIndex,
    rand,
    allowPadDistractors,
  );
  if (!options) return null;

  const correctId =
    options.find((o) => o.text === word)?.id ?? `opt-${questionIndex}-c`;
  const stem = blankFirstOccurrence(sentence, word);
  const prompt = markLimited ? `${LIMITED_PREFIX}${stem}` : stem;

  return {
    sentence,
    question: {
      id: `q-${questionIndex}`,
      prompt,
      options,
      correctOptionId: correctId,
      blankWord: word,
    },
  };
}

/**
 * Generate exactly 4 MCQ cloze questions from a passage chunk.
 * Seed is stable from `url + chunkIndex` (+ optional regenerate salt).
 */
export function generateClozeQuestions(
  passage: string,
  url: string,
  chunkIndex: number,
  regenerateSalt = "",
): ClozeSet {
  const seed = `${url}+${chunkIndex}+${regenerateSalt}`;
  const rand = mulberry32(hashSeed(seed));

  const tokens = tokenize(passage);
  const ranked = rankCandidates(tokens);
  const unique = ranked.map((c) => c.word);
  const sentences = splitSentences(passage);

  // Light shuffle within similar-rank bands so seed still varies picks
  const candidates = ranked.slice();
  for (let i = 0; i < candidates.length - 1; i++) {
    if (
      Math.floor(candidates[i]!.rank / 100) ===
      Math.floor(candidates[i + 1]!.rank / 100)
    ) {
      if (rand() < 0.35) {
        [candidates[i], candidates[i + 1]] = [candidates[i + 1]!, candidates[i]!];
      }
    }
  }

  const questions: ClozeQuestion[] = [];
  const usedAnswers = new Set<string>();
  const usedSentences = new Set<string>();
  const realCandidateCount = ranked.length;
  const hasEnoughCandidates = realCandidateCount >= QUESTION_COUNT;

  const pushMade = (made: { question: ClozeQuestion; sentence: string }) => {
    usedSentences.add(made.sentence);
    usedAnswers.add(made.question.blankWord.toLowerCase());
    questions.push(made.question);
  };

  // Pass 1: prefer unused sentences, ranked blanks
  for (const { word } of candidates) {
    if (questions.length >= QUESTION_COUNT) break;
    const made = tryMakeQuestion(
      word,
      sentences,
      unique,
      usedAnswers,
      usedSentences,
      questions.length,
      rand,
      { allowPadDistractors: hasEnoughCandidates },
    );
    if (made) pushMade(made);
  }

  // Pass 2: reuse sentences if needed when ≥4 real candidates exist
  if (questions.length < QUESTION_COUNT && hasEnoughCandidates) {
    for (const { word } of candidates) {
      if (questions.length >= QUESTION_COUNT) break;
      const made = tryMakeQuestion(
        word,
        sentences,
        unique,
        usedAnswers,
        usedSentences,
        questions.length,
        rand,
        { allowReuseSentence: true, allowPadDistractors: true },
      );
      if (made) pushMade(made);
    }
  }

  // Pass 3: thin text — shorter stems, mark as limited practice items (prefer real)
  if (questions.length < QUESTION_COUNT) {
    for (const { word } of candidates) {
      if (questions.length >= QUESTION_COUNT) break;
      const made = tryMakeQuestion(
        word,
        sentences,
        unique,
        usedAnswers,
        usedSentences,
        questions.length,
        rand,
        {
          markLimited: true,
          allowReuseSentence: true,
          allowPadDistractors: true,
          minSentenceLen: 12,
        },
      );
      if (made) pushMade(made);
    }
  }

  // Last resort only when we truly cannot form 4 real stems
  while (questions.length < QUESTION_COUNT) {
    const i = questions.length;
    const correctId = `opt-${i}-c`;
    questions.push({
      id: `q-${i}`,
      prompt: `${LIMITED_PREFIX}The passage mentions _____.`,
      options: [
        { id: correctId, text: "alpha" },
        { id: `opt-${i}-d0`, text: "beta" },
        { id: `opt-${i}-d1`, text: "gamma" },
        { id: `opt-${i}-d2`, text: "delta" },
      ],
      correctOptionId: correctId,
      blankWord: "alpha",
    });
  }

  return { questions: questions.slice(0, QUESTION_COUNT), seed };
}

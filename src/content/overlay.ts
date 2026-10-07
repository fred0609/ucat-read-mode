import type { ClozeQuestion } from "../lib/cloze";
import { createTimer, DEFAULT_DURATION_MS, type TimerController } from "./timer";

const ROOT_ID = "ucat-rm-root";
const STYLE_ID = "ucat-rm-style";

export type OverlayHandlers = {
  onExit: () => void;
  onCheck: () => void;
  onRegenerate: () => void;
  onRandomWiki: () => void;
  onSelectAnswer: (questionId: string, optionId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Show "Random article" (Wikipedia cold-start jump). */
  showRandomWiki?: boolean;
};

export type OverlayViewModel = {
  passageText: string;
  /** All 4 questions; only currentIndex is shown (UCAT shows one at a time). */
  questions: ClozeQuestion[];
  currentIndex: number;
  selections: Record<string, string>;
  results: Record<string, boolean> | null;
  /** e.g. "Question 1 of 4" */
  progressLabel: string;
};

export type OverlayHandle = {
  root: HTMLElement;
  update: (vm: OverlayViewModel) => void;
  setTimerDisplay: (display: string, overtime: boolean, warn: boolean) => void;
  destroy: () => void;
  timer: TimerController;
};

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("overlay.css");
  document.documentElement.appendChild(link);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

export function isOverlayMounted(): boolean {
  return document.getElementById(ROOT_ID) != null;
}

export function mountOverlay(handlers: OverlayHandlers): OverlayHandle {
  ensureStyles();
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "ucat-rm";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "UCAT-style reading practice");

  const randomWikiBtn = handlers.showRandomWiki
    ? `<button type="button" class="ucat-rm__tool" data-action="random-wiki" title="Open a random linked Wikipedia article and start a new set">Random article</button>`
    : "";

  // No "Passage" / "Questions" panel headers — matches live VR panes.
  root.innerHTML = `
    <div class="ucat-rm__header">
      <div class="ucat-rm__header-left">Verbal Reasoning</div>
      <div class="ucat-rm__header-right">
        <div class="ucat-rm__timer" data-role="timer" aria-live="polite">Time Remaining: 2:00</div>
        <div class="ucat-rm__progress" data-role="progress">Question 1 of 4</div>
      </div>
    </div>
    <div class="ucat-rm__subheader">
      <button type="button" class="ucat-rm__tool" data-action="check">Check</button>
      <button type="button" class="ucat-rm__tool" data-action="regenerate">Regenerate</button>
      ${randomWikiBtn}
    </div>
    <div class="ucat-rm__body">
      <section class="ucat-rm__passage-panel" aria-label="Passage">
        <div class="ucat-rm__passage" data-role="passage"></div>
      </section>
      <section class="ucat-rm__questions-panel" aria-label="Question">
        <div class="ucat-rm__question-pane" data-role="question-pane"></div>
      </section>
    </div>
    <div class="ucat-rm__footer">
      <div class="ucat-rm__footer-left">
        <button type="button" class="ucat-rm__footer-btn" data-action="exit">End</button>
      </div>
      <div class="ucat-rm__footer-right">
        <button type="button" class="ucat-rm__footer-btn" data-action="prev" data-role="prev">Previous</button>
        <div class="ucat-rm__footer-sep" aria-hidden="true"></div>
        <button type="button" class="ucat-rm__footer-btn" data-action="next" data-role="next">Next</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(root);
  document.documentElement.classList.add("ucat-rm-active");

  const timerEl = root.querySelector<HTMLElement>('[data-role="timer"]')!;
  const progressEl = root.querySelector<HTMLElement>('[data-role="progress"]')!;
  const passageEl = root.querySelector<HTMLElement>('[data-role="passage"]')!;
  const questionPane = root.querySelector<HTMLElement>('[data-role="question-pane"]')!;
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-role="prev"]')!;
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-role="next"]')!;

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;

    const actionBtn = t.closest<HTMLElement>("[data-action]");
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === "exit") handlers.onExit();
      if (action === "check") handlers.onCheck();
      if (action === "regenerate") handlers.onRegenerate();
      if (action === "random-wiki") handlers.onRandomWiki();
      if (action === "prev") handlers.onPrev();
      if (action === "next") handlers.onNext();
      return;
    }

    const opt = t.closest<HTMLElement>("[data-option-id]");
    if (opt?.dataset.optionId && opt.dataset.questionId) {
      handlers.onSelectAnswer(opt.dataset.questionId, opt.dataset.optionId);
    }
  });

  const timer = createTimer(DEFAULT_DURATION_MS, (tick) => {
    const warn = !tick.overtime && tick.remainingMs > 0 && tick.remainingMs <= 5 * 60 * 1000;
    // Per-passage MVP clock is 2:00; still apply yellow styling under 30s for visibility.
    const shortWarn = !tick.overtime && tick.remainingMs > 0 && tick.remainingMs <= 30_000;
    timerEl.textContent = `Time Remaining: ${tick.display}`;
    timerEl.classList.toggle("ucat-rm__timer--overtime", tick.overtime);
    timerEl.classList.toggle("ucat-rm__timer--warn", warn || shortWarn);
  });
  timer.start();

  const update = (vm: OverlayViewModel) => {
    progressEl.textContent = vm.progressLabel;
    passageEl.textContent = vm.passageText;

    prevBtn.disabled = vm.currentIndex <= 0;
    nextBtn.disabled = vm.currentIndex >= vm.questions.length - 1;

    questionPane.innerHTML = "";
    const q = vm.questions[vm.currentIndex];
    if (!q) return;

    const prompt = document.createElement("p");
    prompt.className = "ucat-rm__prompt";
    prompt.textContent = q.prompt;
    questionPane.appendChild(prompt);

    const opts = document.createElement("div");
    opts.className = "ucat-rm__options";
    opts.setAttribute("role", "radiogroup");
    opts.setAttribute("aria-label", `Question ${vm.currentIndex + 1}`);

    for (const opt of q.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ucat-rm__option";
      btn.dataset.optionId = opt.id;
      btn.dataset.questionId = q.id;
      btn.setAttribute("role", "radio");
      const selected = vm.selections[q.id] === opt.id;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
      if (selected) btn.classList.add("ucat-rm__option--selected");

      if (vm.results) {
        if (opt.id === q.correctOptionId) btn.classList.add("ucat-rm__option--correct");
        else if (selected) btn.classList.add("ucat-rm__option--wrong");
      }

      const radio = document.createElement("span");
      radio.className = "ucat-rm__radio";
      radio.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "ucat-rm__option-label";
      label.textContent = opt.text;

      btn.appendChild(radio);
      btn.appendChild(label);
      opts.appendChild(btn);
    }

    questionPane.appendChild(opts);

    if (vm.results && q.id in vm.results) {
      const ok = vm.results[q.id];
      const fb = document.createElement("p");
      fb.className = `ucat-rm__feedback ${ok ? "ucat-rm__feedback--ok" : "ucat-rm__feedback--bad"}`;
      fb.textContent = ok ? "Correct" : `Incorrect — answer: ${q.blankWord}`;
      questionPane.appendChild(fb);
    }
  };

  const destroy = () => {
    timer.stop();
    root.remove();
    removeStyles();
    document.documentElement.classList.remove("ucat-rm-active");
  };

  return {
    root,
    update,
    setTimerDisplay(display, overtime, warn) {
      timerEl.textContent = `Time Remaining: ${display}`;
      timerEl.classList.toggle("ucat-rm__timer--overtime", overtime);
      timerEl.classList.toggle("ucat-rm__timer--warn", warn);
    },
    destroy,
    timer,
  };
}

export function showToast(message: string): void {
  ensureStyles();
  const existing = document.querySelector(".ucat-rm-toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.className = "ucat-rm-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.documentElement.appendChild(toast);

  window.setTimeout(() => toast.remove(), 4200);
}

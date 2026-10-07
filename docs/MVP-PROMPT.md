# MVP Build Prompt — UCAT Read Mode

Copy this prompt when spinning agents. Scope is frozen for MVP; do not expand.

---

## Mission

Build a **Chrome/Chromium Manifest V3** browser extension named **UCAT Read Mode** that turns the main text of the current webpage into a free UCAT Verbal Reasoning–style practice set: blue exam UI, countdown timer, one passage of ~200–400 words, and **exactly 4 fill-in-the-blank (cloze) questions** generated locally with **no AI and no network calls**.

Working directory: `/Users/fredericklam/Projects/ucat-read-mode`

## Non-goals (do not build in MVP)

- Firefox / Safari packaging
- True/False/Can't Tell or other question types
- Highlighter, flag, keyboard shortcuts, history, export, streaks, accounts
- Cloud sync, AI, paywall
- Sequential “walk whole article” as default
- Official UCAT logos or trademarked assets

## Product behaviour (must)

1. User clicks the extension action on an article page (e.g. Wikipedia).
2. Extension extracts main readable text (strip nav, ads, footnotes, related links).
3. Text is chunked into passages targeting **~275 words** (clamp **200–400**), preferring paragraph then sentence boundaries.
4. **Default: pick ONE random eligible chunk** (not the first chunk every time). Avoid always starting at the lede when ≥3 chunks exist (bias away from chunk index 0 half the time).
5. Overlay the page with a UCAT-like **cool blue** full-viewport practice UI:
   - **Timer top-left**, default **2:00**, counts down; at 0 show overtime (do not hard-lock answering).
   - Passage body in exam-like panel.
   - Progress label e.g. `Passage 1/1 · Question n/4` (single passage in MVP).
   - Exactly **4 cloze questions** beside/below the passage.
6. Cloze generation (deterministic, local):
   - Blank content words / proper nouns / numbers (not stopwords).
   - Multiple choice: 1 correct + 3 distractors from other content tokens in the same chunk (similar length when possible).
   - Stable seed from `url + chunkIndex` so reload regenerates the same set; include a **Regenerate** button that re-seeds.
7. User can select answers, **Check**, see correct/incorrect, **Exit** to remove overlay and restore the page.
8. If extraction fails or text &lt; 200 words: toast/message and do not enter practice mode.

## Technical requirements

- Manifest V3, TypeScript preferred (or plain JS if simpler — pick one and stay consistent).
- Structure roughly:
  - `manifest.json`
  - `src/background/` service worker (action click → inject/run)
  - `src/content/` overlay UI + practice flow
  - `src/lib/extract.ts` — main content extraction
  - `src/lib/chunk.ts` — chunking + random selection
  - `src/lib/cloze.ts` — 4-question generator
  - `src/lib/stopwords.ts`
  - `src/styles/overlay.css` — blue exam look (original CSS; no copied proprietary assets)
  - Minimal README: load unpacked in `chrome://extensions`
- No external paid APIs. Lightweight deps OK (e.g. none, or a tiny readability helper if needed — prefer zero/minimal deps).
- Privacy: no uploading page content.

## Acceptance checklist

- [ ] Loads as unpacked MV3 extension in Chrome
- [ ] On a long Wikipedia article, opens blue overlay with timer top-left
- [ ] Passage word count is within 200–400
- [ ] Repeated activations on same long page do not always show the same opening section
- [ ] Exactly 4 MCQ cloze questions; Check marks right/wrong
- [ ] Exit removes overlay
- [ ] Short/empty pages show a clear error instead of broken UI
- [ ] README documents how to install and test

## Out-of-scope reminders for later

Sequential stamina mode, TFT questions, Firefox/Safari, highlighter, session history, site presets.

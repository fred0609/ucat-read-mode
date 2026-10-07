# UCAT Read Mode

Chromium **Manifest V3** extension that turns the main text of the current page into a free UCAT Verbal Reasoning–style cloze practice set (local only — no AI, no network uploads).

## Stack

- **TypeScript**
- **esbuild** (bundles background service worker + content script into `dist/`)

## Build

```bash
npm install
npm run build
```

Watch mode:

```bash
npm run watch
```

Output lands in `dist/` (`manifest.json`, `background.js`, `content.js`, `overlay.css`).

## Load unpacked (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the **`dist`** folder (not the repo root).
4. Open a long article (e.g. a Wikipedia page) and click the extension action icon.
5. A cool-blue full-viewport overlay should appear with a 2:00 timer, one passage, and 4 cloze questions.

## Privacy

Page text is processed only in the browser. Nothing is uploaded.

## MVP scope

See [`docs/MVP-PROMPT.md`](docs/MVP-PROMPT.md). Firefox/Safari, AI, history, highlighter, and TFT questions are out of scope for this MVP.

# UCAT Read Mode

A free browser extension that turns any webpage (especially Wikipedia) into **UCAT Verbal Reasoning–style practice**: blue exam-style screen, countdown timer, a short passage, and 4 fill-in-the-blank questions.

Nothing is uploaded — everything runs on your computer.

---

## What you need first

1. **Google Chrome**, **Microsoft Edge**, or **Brave** (desktop)
2. **Node.js** (so you can build the extension once)  
   - Download: [https://nodejs.org](https://nodejs.org) → install the **LTS** version  
   - To check it worked, open Terminal (Mac) or Command Prompt (Windows) and type:
     ```bash
     node -v
     ```
     You should see something like `v20.x.x`.

3. This project on your computer (either):
   - **Option A — Download ZIP:** on GitHub click green **Code** → **Download ZIP** → unzip it  
   - **Option B — Git:**  
     ```bash
     git clone https://github.com/fred0609/ucat-read-mode.git
     ```

---

## Install (one-time setup)

Open Terminal / Command Prompt, go into the project folder, then run:

```bash
cd ucat-read-mode
npm install
npm run build
```

That creates a `dist` folder. You’ll load **that** folder into your browser (not the whole project).

### Load it in Chrome / Brave

1. Open a new tab and go to: `chrome://extensions`
2. Turn **Developer mode** on (top-right toggle)
3. Click **Load unpacked**
4. Select the **`dist`** folder inside `ucat-read-mode`  
   (wrong folder = it won’t work — must be `dist`, not the parent folder)
5. Pin the extension (puzzle-piece icon → pin **UCAT Read Mode**) so it’s easy to click

### Load it in Edge

Same steps, but go to `edge://extensions` instead.

---

## How to use it

1. Open a long article (Wikipedia works best)
2. Click the **UCAT Read Mode** extension icon
3. You’ll get:
   - a UCAT-style blue practice screen
   - **Time Remaining** countdown (default 2 minutes)
   - one passage (~200–400 words)
   - 4 multiple-choice fill-in-the-blank questions
4. Use **Previous / Next** to move between questions, **Check** to mark answers, **End** to leave
5. On Wikipedia, **Random article** jumps to another linked page and starts a new set (fresh topic)

If the page is too short, you’ll see a message instead of the practice screen.

---

## Updating after you change code

```bash
npm run build
```

Then on `chrome://extensions`, click the **reload** icon on UCAT Read Mode.

---

## Privacy

Page text stays in your browser. No accounts, no AI API, no uploads.

---

## For developers

- Stack: TypeScript + esbuild → output in `dist/`
- Watch rebuilds: `npm run watch`
- Chunk tests: `npm run test:chunk`
- Product notes: [`docs/MVP-PROMPT.md`](docs/MVP-PROMPT.md)

Not in this version yet: Firefox / Safari store builds, True/False/Can’t Tell questions, highlighter, or cloud sync.

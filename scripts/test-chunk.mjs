/**
 * Node tests for src/lib/chunk.ts — bundles the pure module then asserts clamp rules.
 */
import * as esbuild from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function words(n, seed = "word") {
  return Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");
}

function sentencesOfWords(totalWords, sentenceSize = 20) {
  const parts = [];
  let left = totalWords;
  let i = 0;
  while (left > 0) {
    const take = Math.min(sentenceSize, left);
    parts.push(words(take, `s${i}w`) + ".");
    left -= take;
    i += 1;
  }
  return parts.join(" ");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const dir = mkdtempSync(join(tmpdir(), "ucat-chunk-"));
const outfile = join(dir, "chunk.mjs");

await esbuild.build({
  entryPoints: [join(root, "src/lib/chunk.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});

const {
  chunkText,
  countWords,
  splitSentences,
  MIN_WORDS,
  MAX_WORDS,
  TARGET_WORDS,
  selectChunk,
} = await import(pathToFileURL(outfile).href);

let passed = 0;
const run = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log("test-chunk");

run("constants match MVP clamp", () => {
  assert(MIN_WORDS === 200, "MIN");
  assert(MAX_WORDS === 400, "MAX");
  assert(TARGET_WORDS === 275, "TARGET");
});

run("normal paragraphs pack near target and stay in clamp", () => {
  // Five ~100-word paragraphs → should pack toward ~275 without exceeding 400
  const paras = Array.from({ length: 5 }, (_, i) => words(100, `p${i}w`));
  const text = paras.join("\n\n");
  const chunks = chunkText(text);
  assert(chunks.length >= 2, `expected multiple chunks, got ${chunks.length}`);
  for (const c of chunks) {
    assert(c.wordCount >= MIN_WORDS, `chunk ${c.index} too short: ${c.wordCount}`);
    assert(c.wordCount <= MAX_WORDS, `chunk ${c.index} too long: ${c.wordCount}`);
  }
  const total = chunks.reduce((s, c) => s + c.wordCount, 0);
  assert(total === 500, `word conservation: ${total}`);
});

run("oversized paragraph splits on sentences within clamp", () => {
  // One 650-word paragraph made of 20-word sentences
  const para = sentencesOfWords(650, 20);
  assert(countWords(para) === 650, "fixture size");
  assert(splitSentences(para).length >= 30, "should produce many sentences");

  const chunks = chunkText(para);
  assert(chunks.length >= 2, `expected split, got ${chunks.length}`);
  for (const c of chunks) {
    assert(c.wordCount >= MIN_WORDS, `too short: ${c.wordCount}`);
    assert(c.wordCount <= MAX_WORDS, `blew past 400: ${c.wordCount}`);
  }
  // Never a single mega-chunk
  assert(
    chunks.every((c) => c.wordCount <= MAX_WORDS),
    "clamp violated",
  );
});

run("short leftover merges into previous when ≤400", () => {
  // ~275 + ~100 leftover should merge into one if ≤400, or stay valid
  // 220-word para + 220-word para + 50-word para
  // First flushes at 220? 220 < TARGET so keeps going: 220+220=440 > MAX → flush 220, then 220+50=270
  const text = [words(220, "a"), words(220, "b"), words(50, "c")].join("\n\n");
  const chunks = chunkText(text);
  for (const c of chunks) {
    assert(c.wordCount >= MIN_WORDS && c.wordCount <= MAX_WORDS, `bad ${c.wordCount}`);
  }
  // 50-word leftover must not appear alone
  assert(
    chunks.every((c) => c.wordCount >= MIN_WORDS),
    "orphan short leftover",
  );
  const total = chunks.reduce((s, c) => s + c.wordCount, 0);
  assert(total === 490, `lost words: ${total}`);
});

run("short leftover drops when merge would exceed 400", () => {
  // 350-word chunk then 80-word leftover → merge = 430 > 400 → drop 80
  const text = [words(350, "a"), words(80, "b")].join("\n\n");
  const chunks = chunkText(text);
  assert(chunks.length === 1, `expected 1 kept chunk, got ${chunks.length}`);
  assert(chunks[0].wordCount === 350, `got ${chunks[0].wordCount}`);
});

run("selectChunk still returns a seeded pick", () => {
  const chunks = chunkText(
    Array.from({ length: 4 }, (_, i) => words(250, `x${i}`)).join("\n\n"),
  );
  assert(chunks.length >= 3, "need pool");
  const a = selectChunk(chunks, "https://example.test/page", "salt");
  const b = selectChunk(chunks, "https://example.test/page", "salt");
  assert(a && b, "null selection");
  assert(a.chunk.index === b.chunk.index, "seed should be stable");
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed`);

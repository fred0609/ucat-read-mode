/**
 * Passage chunking + random eligible-chunk selection.
 *
 * Packs text toward ~275 words (clamp 200–400). Prefers paragraph
 * boundaries; oversized paragraphs (>400 words) are split on sentences.
 * Short leftovers (<200) merge into the previous chunk when ≤400, else drop.
 */

export interface PassageChunk {
  index: number;
  text: string;
  wordCount: number;
}

export interface ChunkSelection {
  chunk: PassageChunk;
  all: PassageChunk[];
  seed: string;
}

export const TARGET_WORDS = 275;
export const MIN_WORDS = 200;
export const MAX_WORDS = 400;

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Split on sentence-ending punctuation; keeps the terminator with each sentence. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s+|$)|[^.!?]+$/g);
  if (!parts) return [trimmed];

  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Last-resort hard split so a single runaway sentence never exceeds MAX. */
function splitByWordLimit(text: string, limit: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return [words.join(" ")];

  const pieces: string[] = [];
  for (let i = 0; i < words.length; i += limit) {
    pieces.push(words.slice(i, i + limit).join(" "));
  }
  return pieces;
}

function expandToSegments(paragraph: string): string[] {
  const sentences = splitSentences(paragraph);
  const segments: string[] = [];

  for (const sentence of sentences) {
    if (countWords(sentence) > MAX_WORDS) {
      segments.push(...splitByWordLimit(sentence, MAX_WORDS));
    } else {
      segments.push(sentence);
    }
  }

  return segments;
}

/**
 * Pack string segments toward TARGET, never exceeding MAX.
 * `joiner` is " " for sentences, "\n\n" for paragraphs.
 */
function packSegments(segments: string[], joiner: string): string[] {
  if (segments.length === 0) return [];

  const packed: string[] = [];
  let buf: string[] = [];
  let bufWords = 0;

  const flush = () => {
    if (buf.length === 0) return;
    packed.push(buf.join(joiner));
    buf = [];
    bufWords = 0;
  };

  for (const seg of segments) {
    const sw = countWords(seg);
    if (sw === 0) continue;

    if (bufWords > 0 && bufWords + sw > MAX_WORDS) {
      flush();
    }

    buf.push(seg);
    bufWords += sw;

    if (bufWords >= TARGET_WORDS) {
      flush();
    }
  }
  flush();

  return coalesceShortLeftovers(packed, joiner);
}

/**
 * Short leftovers (< MIN): merge into previous if combined ≤ MAX; otherwise drop
 * (keep only if the piece is already ≥ MIN — which skips the short path).
 */
function coalesceShortLeftovers(chunks: string[], joiner: string): string[] {
  const result: string[] = [];

  for (const chunk of chunks) {
    const wc = countWords(chunk);
    if (wc >= MIN_WORDS) {
      result.push(chunk);
      continue;
    }

    // Short leftover
    if (result.length === 0) {
      // No previous — drop unless somehow eligible (already checked)
      continue;
    }

    const prev = result[result.length - 1]!;
    const merged = `${prev}${joiner}${chunk}`;
    if (countWords(merged) <= MAX_WORDS) {
      result[result.length - 1] = merged;
    }
    // else drop leftover (cannot merge without blowing past 400)
  }

  return result;
}

function toPassageChunks(texts: string[]): PassageChunk[] {
  return texts.map((text, index) => ({
    index,
    text,
    wordCount: countWords(text),
  }));
}

/**
 * Build passage-sized chunks from extracted text.
 * Paragraph-first packing; sentence-splits any paragraph over 400 words.
 * Guarantees every returned chunk is within 200–400 words.
 */
export function chunkText(text: string): PassageChunk[] {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const out: string[] = [];
  let buf: string[] = [];
  let bufWords = 0;

  const flushBuf = () => {
    if (buf.length === 0) return;
    out.push(buf.join("\n\n"));
    buf = [];
    bufWords = 0;
  };

  for (const para of paragraphs) {
    const pw = countWords(para);
    if (pw === 0) continue;

    if (pw > MAX_WORDS) {
      // Finalize any open paragraph buffer, then sentence-split this para.
      flushBuf();
      const sentenceChunks = packSegments(expandToSegments(para), " ");
      out.push(...sentenceChunks);
      continue;
    }

    if (bufWords > 0 && bufWords + pw > MAX_WORDS) {
      flushBuf();
    }

    buf.push(para);
    bufWords += pw;

    if (bufWords >= TARGET_WORDS) {
      flushBuf();
    }
  }
  flushBuf();

  const coalesced = coalesceShortLeftovers(out, "\n\n");
  return toPassageChunks(coalesced);
}

/** Mulberry32 — tiny seeded PRNG for stable-ish picks. */
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

/**
 * Pick one eligible chunk. Biases away from index 0 when ≥3 chunks exist
 * (skip lede ~half the time). `extraSalt` lets Regenerate re-seed.
 */
export function selectChunk(
  chunks: PassageChunk[],
  url: string,
  extraSalt = "",
): ChunkSelection | null {
  const eligible = chunks.filter(
    (c) => c.wordCount >= MIN_WORDS && c.wordCount <= MAX_WORDS,
  );
  const pool = eligible.length > 0 ? eligible : chunks.filter((c) => c.wordCount >= MIN_WORDS);
  if (pool.length === 0) return null;

  const seed = `${url}::chunk-pick::${extraSalt}`;
  const rand = mulberry32(hashSeed(seed));

  let poolForPick = pool;
  if (pool.length >= 3) {
    const skipLede = rand() < 0.5;
    if (skipLede) {
      const withoutFirst = pool.filter((c) => c.index !== 0);
      if (withoutFirst.length > 0) poolForPick = withoutFirst;
    }
  }

  const pick = poolForPick[Math.floor(rand() * poolForPick.length)]!;
  return { chunk: pick, all: chunks, seed };
}

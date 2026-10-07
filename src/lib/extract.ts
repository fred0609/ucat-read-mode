/**
 * Main-content extraction from the current document.
 * Prefers Wikipedia content roots, strips section headings, and preserves
 * paragraph breaks for chunking.
 */

export interface ExtractResult {
  ok: true;
  text: string;
  wordCount: number;
}

export interface ExtractError {
  ok: false;
  reason: string;
}

export type ExtractOutcome = ExtractResult | ExtractError;

const MIN_WORDS = 200;

/** Wikipedia (and similar) back-matter — drop heading + everything after. */
const STOP_SECTION_RE =
  /^(see also|references|external links|further reading|notes|bibliography|sources|citations|works cited|footnotes|navigation menu|related pages)$/i;

const NOISE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  ".nav",
  ".navbar",
  ".sidebar",
  ".footer",
  ".advert",
  ".ad",
  ".ads",
  "#toc",
  ".mw-editsection",
  ".reference",
  ".references",
  ".reflist",
  ".catlinks",
  ".navbox",
  ".noprint",
  ".infobox",
  ".gallery",
  ".thumb",
  ".thumbcaption",
  "sup.reference",
  "sup[id^='cite']",
].join(",");

/** Block-level nodes whose text should become separate paragraphs (no headings). */
const BLOCK_SELECTOR = "p, li, blockquote, pre, dt, dd";

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeInline(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\[edit\]/gi, "")
    .replace(/\[citation needed\]/gi, "")
    .replace(/\[[\d,\s–-]+\]/g, "") // [1], [1][2], [1–3]
    .replace(/[ \t]+/g, " ")
    .trim();
}

function headingTitle(el: Element): string {
  const headline = el.querySelector(".mw-headline");
  const raw = headline?.textContent ?? el.textContent ?? "";
  return normalizeInline(raw);
}

/**
 * Modern Vector skin wraps h2–h6 in `.mw-heading`; remove the wrapper when present
 * so sibling walk drops the whole section, not just the inner heading tag.
 */
function headingBlock(el: Element): Element {
  if (el.classList.contains("mw-heading")) return el;
  const parent = el.parentElement;
  if (parent?.classList.contains("mw-heading")) return parent;
  return el;
}

/**
 * Drop Wikipedia back-matter from the first matching section heading onward,
 * then remove all remaining headings so titles like "History" never enter the passage.
 */
export function stripSectionHeadings(root: HTMLElement): void {
  const headingSelector = "h1, h2, h3, h4, h5, h6, .mw-heading";
  const headings = Array.from(root.querySelectorAll(headingSelector));

  for (const h of headings) {
    if (!STOP_SECTION_RE.test(headingTitle(h))) continue;

    let node: Element | null = headingBlock(h);
    while (node) {
      const next: Element | null = node.nextElementSibling;
      node.remove();
      node = next;
    }
    break;
  }

  root.querySelectorAll(headingSelector).forEach((el) => el.remove());
}

function cleanClone(root: HTMLElement): void {
  root.querySelectorAll(NOISE_SELECTORS).forEach((el) => el.remove());

  root.querySelectorAll("sup").forEach((sup) => {
    const t = (sup.textContent ?? "").trim();
    if (/^\[?\d+\]?$/.test(t) || /^\d+$/.test(t)) {
      sup.remove();
    }
  });

  stripSectionHeadings(root);
}

/**
 * Walk block elements and join with blank lines so chunking keeps structure.
 * Falls back to whole-root text when no blocks are found.
 */
function collectBlockText(root: HTMLElement): string {
  const blocks = root.querySelectorAll(BLOCK_SELECTOR);
  if (blocks.length === 0) {
    return normalizeInline(root.textContent ?? "");
  }

  const parts: string[] = [];
  const seen = new Set<Element>();

  for (const el of Array.from(blocks)) {
    let ancestor = el.parentElement;
    let nested = false;
    while (ancestor && ancestor !== root) {
      if (seen.has(ancestor) && ancestor.matches(BLOCK_SELECTOR)) {
        nested = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (nested) continue;

    const text = normalizeInline(el.textContent ?? "");
    if (!text) continue;

    seen.add(el);
    parts.push(text);
  }

  if (parts.length === 0) {
    return normalizeInline(root.textContent ?? "");
  }

  return parts.join("\n\n");
}

function pickContentRoot(clone: HTMLElement): HTMLElement {
  const mwParser = clone.querySelector(".mw-parser-output");
  if (mwParser instanceof HTMLElement) return mwParser;

  const mwContent = clone.querySelector("#mw-content-text");
  if (mwContent instanceof HTMLElement) {
    const nested = mwContent.querySelector(".mw-parser-output");
    if (nested instanceof HTMLElement) return nested;
    return mwContent;
  }

  const article = clone.querySelector("article");
  if (article instanceof HTMLElement) return article;

  const main = clone.querySelector("main");
  if (main instanceof HTMLElement) return main;

  const content = clone.querySelector("#content");
  if (content instanceof HTMLElement) return content;

  return clone;
}

/**
 * Extract readable main text from `doc` (defaults to the page document).
 * Returns an error outcome when text is too short for practice.
 */
export function extractMainText(doc: Document = document): ExtractOutcome {
  const clone = doc.body?.cloneNode(true) as HTMLElement | null;
  if (!clone) {
    return { ok: false, reason: "No page body found." };
  }

  const root = pickContentRoot(clone);
  cleanClone(root);

  const text = collectBlockText(root)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const wordCount = countWords(text);

  if (wordCount < MIN_WORDS) {
    return {
      ok: false,
      reason: `Not enough readable text (${wordCount} words; need at least ${MIN_WORDS}).`,
    };
  }

  return { ok: true, text, wordCount };
}

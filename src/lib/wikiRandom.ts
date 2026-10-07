/**
 * Pick a random internal Wikipedia article linked from the current page
 * so the next practice set is a cold-start on new subject matter.
 */

const AUTOSTART_KEY = "ucat-rm-autostart";

const NAMESPACE_RE =
  /^(Special|File|Image|Category|Help|Wikipedia|Talk|Portal|Template|User|Draft|Module|MediaWiki|TimedText|WP|MOS):/i;

export function isWikipediaHost(hostname: string = location.hostname): boolean {
  return /(^|\.)wikipedia\.org$/i.test(hostname);
}

function articleTitleFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/wiki/")) return null;
  try {
    return decodeURIComponent(pathname.slice("/wiki/".length));
  } catch {
    return null;
  }
}

function isUsableArticleUrl(href: string, currentPath: string): boolean {
  let url: URL;
  try {
    url = new URL(href, location.origin);
  } catch {
    return false;
  }

  if (!isWikipediaHost(url.hostname)) return false;
  if (url.origin !== location.origin) {
    // Allow sister-language articles only if same project host family — stay same wiki
    return false;
  }

  const title = articleTitleFromPath(url.pathname);
  if (!title || !title.trim()) return false;
  if (NAMESPACE_RE.test(title)) return false;
  if (title.includes("#")) return false;
  if (url.pathname === currentPath) return false;

  return true;
}

/**
 * Collect unique article URLs from the main content (not sidebar / nav).
 */
export function collectWikipediaArticleLinks(doc: Document = document): string[] {
  if (!isWikipediaHost()) return [];

  const root =
    doc.querySelector("#mw-content-text .mw-parser-output") ??
    doc.querySelector("#mw-content-text") ??
    doc.querySelector("#bodyContent") ??
    doc.body;

  if (!root) return [];

  const currentPath = location.pathname;
  const seen = new Set<string>();
  const links: string[] = [];

  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    if (a.classList.contains("new")) continue; // red link — missing page
    if (a.closest(".navbox, .infobox, .hatnote, .metadata, .toc, #toc")) continue;

    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) continue;
    if (!isUsableArticleUrl(href, currentPath)) continue;

    const abs = new URL(href, location.origin);
    abs.hash = "";
    const key = abs.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(abs.href);
  }

  return links;
}

export function pickRandomWikipediaArticleUrl(
  doc: Document = document,
): string | null {
  const links = collectWikipediaArticleLinks(doc);
  if (links.length === 0) return null;
  return links[Math.floor(Math.random() * links.length)] ?? null;
}

export function markAutostartOnNextLoad(): void {
  try {
    sessionStorage.setItem(AUTOSTART_KEY, "1");
  } catch {
    // private mode / blocked storage — navigation still works; user re-clicks icon
  }
}

export function consumeAutostartFlag(): boolean {
  try {
    if (sessionStorage.getItem(AUTOSTART_KEY) !== "1") return false;
    sessionStorage.removeItem(AUTOSTART_KEY);
    return true;
  } catch {
    return false;
  }
}

import { MSG, type ExtensionMessage } from "../shared/messages";

const CONTENT_SCRIPT = "content.js";

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.PING } satisfies ExtensionMessage);
    return;
  } catch {
    // Not injected yet (or page not ready) — inject below.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null || tab.url == null) return;

  // Skip chrome:// and other restricted URLs
  if (!/^https?:/i.test(tab.url)) {
    console.warn("[UCAT Read Mode] Cannot run on this URL:", tab.url);
    return;
  }

  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: MSG.START_PRACTICE,
    } satisfies ExtensionMessage);
  } catch (err) {
    console.error("[UCAT Read Mode] Failed to start practice:", err);
  }
});

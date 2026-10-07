import { consumeAutostartFlag } from "../lib/wikiRandom";
import { MSG, type ExtensionMessage } from "../shared/messages";
import { startPractice } from "./practice";

declare global {
  interface Window {
    __ucatReadModeLoaded?: boolean;
  }
}

function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean | void {
  if (message?.type === MSG.PING) {
    sendResponse({ type: MSG.PONG });
    return;
  }
  if (message?.type === MSG.START_PRACTICE) {
    startPractice();
    sendResponse({ ok: true });
    return;
  }
}

function maybeAutostart(): void {
  if (!consumeAutostartFlag()) return;
  // Let the article DOM settle before extracting.
  window.setTimeout(() => startPractice(), 400);
}

if (!window.__ucatReadModeLoaded) {
  window.__ucatReadModeLoaded = true;
  chrome.runtime.onMessage.addListener(handleMessage);
  maybeAutostart();
}

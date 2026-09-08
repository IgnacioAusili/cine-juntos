import { dom } from "../core/dom.js";
import { getClientLogText, logEvent } from "../core/state.js?v=20260907-mobile-keyboard-diagnostics-02";

function isTestRoute() {
  return window.location.pathname === "/console"
    || new URLSearchParams(window.location.search).has("console");
}

function syncDebugButtonVisibility() {
  if (!dom.mobileDebugButton || !dom.sessionView) return;
  dom.mobileDebugButton.hidden = dom.sessionView.hidden;
}

function refreshLogTextarea() {
  if (dom.mobileDebugLog) dom.mobileDebugLog.value = getClientLogText();
}

async function copyLogs() {
  refreshLogTextarea();
  const text = dom.mobileDebugLog?.value || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    dom.mobileDebugLog?.select();
    document.execCommand("copy");
    dom.mobileDebugLog?.setSelectionRange(text.length, text.length);
  }
  logEvent("mobile-keyboard-debug", "test-ui:log-copied");
}

export function wireMobileDebugTools() {
  if (!isTestRoute() || !dom.mobileDebugButton || !dom.mobileDebugDialog) return;

  syncDebugButtonVisibility();
  const observer = new MutationObserver(syncDebugButtonVisibility);
  observer.observe(dom.sessionView, { attributes: true, attributeFilter: ["hidden"] });

  dom.mobileDebugButton.addEventListener("click", () => {
    refreshLogTextarea();
    dom.mobileDebugDialog.showModal();
    dom.mobileDebugLog?.scrollTo(0, dom.mobileDebugLog.scrollHeight);
  });
  dom.mobileDebugCloseButton?.addEventListener("click", () => dom.mobileDebugDialog.close());
  dom.mobileDebugCopyButton?.addEventListener("click", copyLogs);
  dom.mobileDebugDialog.addEventListener("click", (event) => {
    if (event.target === dom.mobileDebugDialog) dom.mobileDebugDialog.close();
  });
}

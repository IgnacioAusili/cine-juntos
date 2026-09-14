import { dom } from "../core/dom.js";
import { clearClientLog, getClientLogText, logEvent } from "../core/state.js?v=20260914-console-log-controls-01";

const LOG_FILE_NAME = "cine-juntos-log.txt";
const SHARE_TITLE = "Log de diagnóstico de Cine Juntos";
const SHARE_TEXT_FALLBACK = "Log de diagnóstico de Cine Juntos";
let mobileDebugScrollPosition = null;

function isTestRoute() {
  return window.location.pathname === "/console"
    || new URLSearchParams(window.location.search).has("console");
}

function syncDebugButtonVisibility() {
  if (!dom.mobileDebugButton || !dom.sessionView) return;
  dom.mobileDebugButton.hidden = dom.sessionView.hidden;
}

function refreshLogTextarea() {
  if (!dom.mobileDebugLog) return;
  const filter = dom.mobileDebugFilter?.value.trim().toLocaleLowerCase("es-AR") || "";
  const text = getClientLogText();
  dom.mobileDebugLog.value = filter
    ? text.split("\n").filter((line) => line.toLocaleLowerCase("es-AR").includes(filter)).join("\n")
    : text;
}

function clearLogs() {
  clearClientLog();
  refreshLogTextarea();
}

function restoreMobileDebugScroll() {
  if (!mobileDebugScrollPosition) return;
  window.scrollTo(mobileDebugScrollPosition.left, mobileDebugScrollPosition.top);
}

function closeMobileDebugDialog() {
  dom.mobileDebugDialog.close();
  restoreMobileDebugScroll();
  requestAnimationFrame(() => {
    restoreMobileDebugScroll();
    mobileDebugScrollPosition = null;
  });
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

function downloadLogs(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = LOG_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareLogs() {
  refreshLogTextarea();
  const text = dom.mobileDebugLog?.value || "";
  const file = typeof File === "function"
    ? new File([text], LOG_FILE_NAME, { type: "text/plain" })
    : null;

  if (typeof navigator.share !== "function") {
    downloadLogs(text);
    logEvent("mobile-keyboard-debug", "test-ui:log-share-fallback-download");
    return;
  }

  let canShareFiles = Boolean(file) && typeof navigator.canShare !== "function";
  if (file && typeof navigator.canShare === "function") {
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch {
      canShareFiles = false;
    }
  }

  try {
    if (canShareFiles) {
      await navigator.share({
        title: SHARE_TITLE,
        text: SHARE_TEXT_FALLBACK,
        files: [file],
      });
      logEvent("mobile-keyboard-debug", "test-ui:log-shared-file");
    } else {
      await navigator.share({
        title: SHARE_TITLE,
        text,
      });
      logEvent("mobile-keyboard-debug", "test-ui:log-shared-text-fallback");
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      logEvent("mobile-keyboard-debug", "test-ui:log-share-cancelled");
      return;
    }
    downloadLogs(text);
    logEvent("mobile-keyboard-debug", `test-ui:log-share-fallback-download (${error?.message || "error desconocido"}).`);
  }
}

export function wireMobileDebugTools() {
  if (!isTestRoute() || !dom.mobileDebugButton || !dom.mobileDebugDialog) return;
  const mobileDebugShareButton = document.querySelector("#mobileDebugShareButton");

  syncDebugButtonVisibility();
  const observer = new MutationObserver(syncDebugButtonVisibility);
  observer.observe(dom.sessionView, { attributes: true, attributeFilter: ["hidden"] });

  dom.mobileDebugButton.addEventListener("click", () => {
    mobileDebugScrollPosition = { left: window.scrollX, top: window.scrollY };
    refreshLogTextarea();
    dom.mobileDebugDialog.showModal();
    dom.mobileDebugCloseButton?.focus({ preventScroll: true });
    restoreMobileDebugScroll();
    requestAnimationFrame(restoreMobileDebugScroll);
    dom.mobileDebugLog?.scrollTo(0, dom.mobileDebugLog.scrollHeight);
  });
  dom.mobileDebugCloseButton?.addEventListener("click", closeMobileDebugDialog);
  dom.mobileDebugCopyButton?.addEventListener("click", copyLogs);
  mobileDebugShareButton?.addEventListener("click", shareLogs);
  dom.mobileDebugClearButton?.addEventListener("click", clearLogs);
  dom.mobileDebugFilter?.addEventListener("input", refreshLogTextarea);
  dom.mobileDebugDialog.addEventListener("close", () => {
    restoreMobileDebugScroll();
    requestAnimationFrame(() => {
      restoreMobileDebugScroll();
      mobileDebugScrollPosition = null;
    });
  });
  dom.mobileDebugDialog.addEventListener("click", (event) => {
    if (event.target === dom.mobileDebugDialog) closeMobileDebugDialog();
  });
}

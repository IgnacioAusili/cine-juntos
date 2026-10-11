import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { clearClientLog, getClientLogText, logEvent } from "../core/state.js?v=20261010-file-size-refactor-02";

const LOG_FILE_NAME = "cine-juntos-log.txt";
const SHARE_TITLE = "Log de diagnóstico de Cine Juntos";
const SHARE_TEXT_FALLBACK = "Log de diagnóstico de Cine Juntos";
let mobileDebugScrollPosition = null;
let consoleLogCaptureInstalled = false;
let mobileDebugRefreshTimer = 0;
let mobileDebugCopyFeedbackTimer = 0;

function isTestRoute() {
  return window.location.pathname === "/console"
    || new URLSearchParams(window.location.search).has("console")
    || window.location.pathname.startsWith("/test/dialog/");
}

function formatConsoleArgument(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

export function installConsoleLogCapture() {
  if (!isTestRoute() || consoleLogCaptureInstalled) return;
  consoleLogCaptureInstalled = true;

  const nativeConsoleLog = console.log.bind(console);
  console.log = (...args) => {
    logEvent("console.log", args.map(formatConsoleArgument).join(" "));
    nativeConsoleLog(...args);
  };

  nativeConsoleLog("[console-capture] enabled for the /console route");
}

function syncDebugButtonVisibility() {
  if (!dom.mobileDebugButton || !dom.sessionView) return;
  dom.mobileDebugButton.hidden = dom.sessionView.hidden;
}

function getFilteredLog() {
  const filter = dom.mobileDebugFilter?.value.trim().toLocaleLowerCase("es-AR") || "";
  const text = getClientLogText();
  return {
    filter,
    text: filter
      ? text.split("\n").filter((line) => line.toLocaleLowerCase("es-AR").includes(filter)).join("\n")
      : text,
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function highlightLogLine(line, filter) {
  if (!filter) return escapeHtml(line);

  const normalizedLine = line.toLocaleLowerCase("es-AR");
  let searchStart = 0;
  let lastIndex = 0;
  let highlightedLine = "";

  while (searchStart < normalizedLine.length) {
    const matchIndex = normalizedLine.indexOf(filter, searchStart);
    if (matchIndex === -1) break;
    highlightedLine += escapeHtml(line.slice(lastIndex, matchIndex));
    highlightedLine += "<mark>" + escapeHtml(line.slice(matchIndex, matchIndex + filter.length)) + "</mark>";
    lastIndex = matchIndex + filter.length;
    searchStart = lastIndex;
  }

  return highlightedLine + escapeHtml(line.slice(lastIndex));
}

function highlightLogText(text, filter) {
  if (!text) return "";
  return text.split("\n").map((line) => highlightLogLine(line, filter)).join("\n");
}

function refreshLogViewer() {
  if (!dom.mobileDebugLog) return "";
  const { filter, text } = getFilteredLog();
  dom.mobileDebugLog.innerHTML = highlightLogText(text, filter);
  const filterClearButton = document.querySelector("#mobileDebugFilterClearButton");
  if (filterClearButton) filterClearButton.hidden = !dom.mobileDebugFilter?.value;
  return text;
}

function clearLogs() {
  clearClientLog();
  refreshLogViewer();
}

function startLiveLogViewer() {
  window.clearInterval(mobileDebugRefreshTimer);
  mobileDebugRefreshTimer = window.setInterval(refreshLogViewer, 250);
}

function stopLiveLogViewer() {
  window.clearInterval(mobileDebugRefreshTimer);
  mobileDebugRefreshTimer = 0;
}

function setCopyFeedback(state) {
  const button = dom.mobileDebugCopyButton;
  if (!button) return;

  window.clearTimeout(mobileDebugCopyFeedbackTimer);
  button.dataset.copyState = state;
  button.setAttribute(
    "aria-label",
    state === "success" ? "Copiado" : state === "error" ? "Error al copiar" : "Copiar",
  );

  if (state !== "idle") {
    mobileDebugCopyFeedbackTimer = window.setTimeout(() => {
      button.dataset.copyState = "idle";
      button.setAttribute("aria-label", "Copiar");
    }, 2200);
  }
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

function copyTextFallback(text) {
  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.style.position = "fixed";
  fallbackInput.style.opacity = "0";
  document.body.appendChild(fallbackInput);
  fallbackInput.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  fallbackInput.remove();
  return copied;
}

async function copyLogs() {
  const text = refreshLogViewer();
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    } else {
      copied = copyTextFallback(text);
    }
  } catch {
    copied = copyTextFallback(text);
  }
  setCopyFeedback(copied ? "success" : "error");
  logEvent("mobile-keyboard-debug", copied ? "test-ui:log-copied" : "test-ui:log-copy-failed");
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
  const text = refreshLogViewer();
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
    refreshLogViewer();
    dom.mobileDebugDialog.showModal();
    startLiveLogViewer();
    dom.mobileDebugCloseButton?.focus({ preventScroll: true });
    restoreMobileDebugScroll();
    requestAnimationFrame(restoreMobileDebugScroll);
    dom.mobileDebugLog?.scrollTo(0, dom.mobileDebugLog.scrollHeight);
  });
  dom.mobileDebugCloseButton?.addEventListener("click", closeMobileDebugDialog);
  dom.mobileDebugCopyButton?.addEventListener("click", copyLogs);
  mobileDebugShareButton?.addEventListener("click", shareLogs);
  dom.mobileDebugClearButton?.addEventListener("click", clearLogs);
  dom.mobileDebugFilter?.addEventListener("input", refreshLogViewer);
  document.querySelector("#mobileDebugFilterClearButton")?.addEventListener("click", () => {
    if (!dom.mobileDebugFilter) return;
    dom.mobileDebugFilter.value = "";
    refreshLogViewer();
    dom.mobileDebugFilter.focus();
  });
  dom.mobileDebugDialog.addEventListener("close", () => {
    stopLiveLogViewer();
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

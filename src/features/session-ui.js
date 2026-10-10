import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { initializeAboutDialog } from "./session-about-dialog.js?v=20261010-file-size-refactor-02";
import { showErrorDialog, showLoadReplaceDialog, showSlowLoadDialog, showResumeVideoDialog } from "./session-dialogs.js?v=20261010-file-size-refactor-02";
export { initializeAboutDialog } from "./session-about-dialog.js?v=20261010-file-size-refactor-02";
export { showErrorDialog, showLoadReplaceDialog, showSlowLoadDialog, showResumeVideoDialog } from "./session-dialogs.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../core/state.js?v=20261010-file-size-refactor-02";
import { refreshLayoutMetrics } from "./layout-metrics.js?v=20261010-file-size-refactor-02";

const ROOM_ENTRY_VIDEO_FOCUS_TIMEOUT_MS = 8000;
let userScrollIntentVersion = 0;
let pendingRoomEntryVideoFocusCleanup = null;
let roomEntryFocusScrollActive = false;

function markUserScrollIntent() {
  userScrollIntentVersion += 1;
  if (!roomEntryFocusScrollActive) return;
  roomEntryFocusScrollActive = false;
  window.scrollTo({ top: window.scrollY, behavior: "auto" });
}

function isEditableScrollTarget(target) {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select, [contenteditable='true']")
    || Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

window.addEventListener("wheel", markUserScrollIntent, { capture: true, passive: true });
window.addEventListener("touchmove", markUserScrollIntent, { capture: true, passive: true });
window.addEventListener("pointerdown", markUserScrollIntent, { capture: true, passive: true });
window.addEventListener("keydown", (event) => {
  if (
    !isEditableScrollTarget(event.target)
    && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Spacebar"].includes(event.key)
  ) {
    markUserScrollIntent();
  }
}, { capture: true, passive: true });

export function getUserScrollIntentVersion() {
  return userScrollIntentVersion;
}

function getPageScrollTop() {
  return Math.max(
    window.scrollY || 0,
    document.scrollingElement?.scrollTop || 0,
  );
}

function hasLoadedVideo() {
  const video = dom.videoPlayer;
  if (!video || !(video.currentSrc || video.getAttribute("src"))) return false;
  return state.player.hasPlayableVideo && video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function focusMainWorkspace() {
  const workspaceTop = dom.workspace?.offsetTop ?? 0;
  roomEntryFocusScrollActive = true;
  window.scrollTo({ top: workspaceTop, behavior: "smooth" });
}

export function watchRoomEntryVideoFocus(userScrollIntentAtEntry = userScrollIntentVersion) {
  pendingRoomEntryVideoFocusCleanup?.();

  const video = dom.videoPlayer;
  if (!video) return { activate() {}, cancel() {} };

  let isActive = false;
  let settled = false;
  let timeoutId = 0;
  const videoEvents = ["loadedmetadata", "loadeddata", "canplay", "playing"];

  const cleanup = () => {
    if (settled) return;
    settled = true;
    videoEvents.forEach((eventName) => video.removeEventListener(eventName, tryFocus));
    window.clearTimeout(timeoutId);
    roomEntryFocusScrollActive = false;
    if (pendingRoomEntryVideoFocusCleanup === cleanup) {
      pendingRoomEntryVideoFocusCleanup = null;
    }
  };

  const tryFocus = () => {
    if (settled || !isActive) return;
    if (
      dom.sessionView?.hidden
      || userScrollIntentVersion !== userScrollIntentAtEntry
      || getPageScrollTop() > 2
    ) {
      cleanup();
      return;
    }
    if (!hasLoadedVideo()) return;

    cleanup();
    window.requestAnimationFrame(() => {
      if (
        dom.sessionView?.hidden
        || userScrollIntentVersion !== userScrollIntentAtEntry
        || getPageScrollTop() > 2
        || !hasLoadedVideo()
      ) return;
      focusMainWorkspace();
    });
  };

  videoEvents.forEach((eventName) => video.addEventListener(eventName, tryFocus));
  timeoutId = window.setTimeout(cleanup, ROOM_ENTRY_VIDEO_FOCUS_TIMEOUT_MS);
  pendingRoomEntryVideoFocusCleanup = cleanup;

  return {
    activate() {
      isActive = true;
      tryFocus();
    },
    cancel: cleanup,
  };
}

export function showLobby() {
  dom.lobbyScreen.hidden = false;
  dom.sessionView.hidden = true;
  document.body.classList.add("is-lobby");
  setHostBadge(false);
  refreshLayoutMetrics();
}

export function showSession() {
  dom.lobbyScreen.hidden = true;
  dom.sessionView.hidden = false;
  document.body.classList.remove("is-lobby");
  refreshLayoutMetrics();
}

export function setHostBadge(visible) {
  if (!dom.hostBadge) return;
  dom.hostBadge.hidden = !visible;
}

export function focusFullscreenWorkspace() {
  window.requestAnimationFrame(() => {
    dom.videoArea?.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

export function setSyncStatus(text) {
  window.clearTimeout(state.player.syncStatusTimer);
  if (dom.lobbyStatus) dom.lobbyStatus.textContent = text;
  state.player.syncStatusTimer = window.setTimeout(() => {
    if (dom.lobbyStatus) dom.lobbyStatus.textContent = "Listo";
  }, 4500);
}

export function setConnection(mode, label) {
  if (!dom.connectionStatus) return;

  const nextMode =
    mode === "firebase"
      ? "online"
      : ["online", "local", "starting", "error"].includes(mode)
        ? mode
        : "online";
  const tooltipByMode = {
    online: "La sala está funcionando",
    local: "La sala está funcionando",
    starting: "Conectando con la sala",
    error: label && label !== "Sin conexión" ? label : "La sala no pudo conectarse",
  };
  const nextLabel = nextMode === "starting" ? "Iniciando" : nextMode === "error" ? "Sin conexión" : "Conectado";
  const nextTooltip = tooltipByMode[mode === "firebase" ? "online" : nextMode];

  dom.connectionStatus.dataset.state = nextMode;
  dom.connectionStatus.dataset.tooltip = nextTooltip;
  dom.connectionStatus.setAttribute(
    "aria-label",
    `Estado de la aplicación: ${nextLabel}. ${nextTooltip}`,
  );
  logEvent("connection", nextLabel);
}
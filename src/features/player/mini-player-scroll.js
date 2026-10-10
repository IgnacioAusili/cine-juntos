import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";

const SCROLL_MINI_PLAYER_DISMISSED_KEY = "cine-juntos-scroll-mini-player-dismissed";
const MOBILE_VIEWPORT_QUERY = "(max-width: 680px), (hover: none) and (pointer: coarse)";
let scrollMiniPlayerFrame = 0;
let scrollMiniPlayerDismissedRoom = "";
let scrollMiniPlayerOperations = {};
export function configureScrollMiniPlayerOperations(operations) { scrollMiniPlayerOperations = operations || {}; }
function getScrollMiniPlayerOperations() {
  const required = ["hasMedia", "restoreMainPlayer", "openScrollMiniPlayer"];
  if (required.some((key) => typeof scrollMiniPlayerOperations[key] !== "function")) throw new Error("El mini-reproductor de scroll requiere las operaciones del reproductor.");
  return scrollMiniPlayerOperations;
}

export function scheduleScrollMiniPlayerSync() {
  if (scrollMiniPlayerFrame) return;
  scrollMiniPlayerFrame = window.requestAnimationFrame(() => {
    scrollMiniPlayerFrame = 0;
    syncScrollMiniPlayer();
  });
}

function syncScrollMiniPlayer() {
  syncScrollMiniPlayerDismissalState();
  if (isMobileViewport()) {
    if (state.player.miniPlayerMode === "scroll") getScrollMiniPlayerOperations().restoreMainPlayer();
    return;
  }

  const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
  if (!isBottomDock || !getScrollMiniPlayerOperations().hasMedia()) {
    if (state.player.miniPlayerMode === "scroll") getScrollMiniPlayerOperations().restoreMainPlayer();
    return;
  }

  const videoRect = dom.playerFrame?.getBoundingClientRect();
  const chatRect = dom.chatArea?.getBoundingClientRect();
  if (!videoRect || !chatRect) return;

  const chatIsVisible = chatRect.top < window.innerHeight && chatRect.bottom > 0;
  const videoIsMostlyOutOfView = videoRect.bottom < window.innerHeight * 0.6;
  const shouldFloat = chatIsVisible && videoIsMostlyOutOfView;

  if (!shouldFloat) {
    if (state.player.miniPlayerMode === "scroll") getScrollMiniPlayerOperations().restoreMainPlayer();
    return;
  }

  if (
    !state.player.miniPlayerMode
    && !state.player.scrollMiniPlayerDismissed
  ) {
    getScrollMiniPlayerOperations().openScrollMiniPlayer();
  }
}

function isMobileViewport() {
  return window.matchMedia?.(MOBILE_VIEWPORT_QUERY).matches === true;
}

function syncScrollMiniPlayerDismissalState() {
  const room = state.session.activeRoom || "lobby";
  if (scrollMiniPlayerDismissedRoom === room) return;

  scrollMiniPlayerDismissedRoom = room;
  state.player.scrollMiniPlayerDismissed = readScrollMiniPlayerDismissal(room);
}

export function dismissScrollMiniPlayerForSession() {
  state.player.scrollMiniPlayerDismissed = true;
  const room = state.session.activeRoom || "lobby";
  scrollMiniPlayerDismissedRoom = room;
  try {
    sessionStorage.setItem(getScrollMiniPlayerDismissalKey(room), "1");
  } catch {
    // Si el almacenamiento está bloqueado, el estado en memoria sigue vigente.
  }
}

function readScrollMiniPlayerDismissal(room) {
  try {
    return sessionStorage.getItem(getScrollMiniPlayerDismissalKey(room)) === "1";
  } catch {
    return false;
  }
}

function getScrollMiniPlayerDismissalKey(room) {
  return `${SCROLL_MINI_PLAYER_DISMISSED_KEY}:${room}`;
}

import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { wireTouchHover } from "../../core/touch-interactions.js";
import { setControlIcon } from "../icons-tooltips.js";
import { setSyncStatus } from "../session-ui.js?v=20260827-entry-scroll-fix-01";
import {
  createMiniPlayerSurface,
  installMiniPlayerWindowStyles,
} from "./mini-player-controls.js";
import {
  mirrorMiniPlayerChatState,
} from "./mini-player-chat.js?v=20260813-mini-chat-reply-fix-01";
import { movePlayerInterface } from "./mini-player-interface.js?v=20260813-mini-chat-reply-fix-01";
import { trackMiniPlayerReturnHint } from "./mini-player-return-hint.js";
import { clampMiniPlayerPosition, wireMiniPlayerDrag } from "./mini-player-drag.js?v=20260808-scroll-mini-player-02";

let miniSurface = null;
let pictureInPictureWindow = null;
let miniPlayerChat = null;
let miniPlayerInterface = null;
let stopMiniPlayerReturnHintTracking = null;
let stopMiniPlayerDrag = null;
let stopMiniPlayerOverlayControls = null;
let scrollMiniPlayerFrame = 0;
let scrollMiniPlayerDismissedRoom = "";

const SCROLL_MINI_PLAYER_DISMISSED_KEY = "cine-juntos-scroll-mini-player-dismissed";
const MOBILE_VIEWPORT_QUERY = "(max-width: 680px)";

export function wireMiniPlayerEvents() {
  dom.playerMiniPlayerButton?.addEventListener("click", () => {
    void toggleMiniPlayer();
  });
  dom.videoPlayer.addEventListener("leavepictureinpicture", () => {
    if (state.player.miniPlayerMode === "native") restoreMainPlayer();
  });
  window.addEventListener("scroll", scheduleScrollMiniPlayerSync, { passive: true });
  window.addEventListener("resize", () => {
    scheduleScrollMiniPlayerSync();
    clampMiniPlayerPosition(miniSurface);
  }, { passive: true });
  if (dom.sessionView && "MutationObserver" in window) {
    const chatLayoutObserver = new MutationObserver(scheduleScrollMiniPlayerSync);
    chatLayoutObserver.observe(dom.sessionView, {
      attributes: true,
      attributeFilter: ["class", "data-chat-dock"],
    });
  }
  scheduleScrollMiniPlayerSync();
}

export async function toggleMiniPlayer() {
  if (isMiniPlayerActive()) {
    if (state.player.miniPlayerMode === "scroll") dismissScrollMiniPlayerForSession();
    await closeMiniPlayer();
    return;
  }
  if (!hasMedia()) return;

  const chatWasOpen = dom.playerFrame.classList.contains("chat-inside-open");

  state.player.miniPlayerMode = "opening";
  syncMiniPlayerButton(true);
  try {
    if (supportsDocumentPictureInPicture()) {
      await openDocumentPictureInPicture(chatWasOpen);
    } else if (typeof dom.videoPlayer.requestPictureInPicture === "function") {
      await openNativePictureInPicture();
    } else {
      openInlineMiniPlayer(chatWasOpen);
    }
  } catch (error) {
    console.warn("No se pudo abrir Picture-in-Picture; se usa la miniatura local.", error);
    openInlineMiniPlayer(chatWasOpen);
  }
}

export function isMiniPlayerActive() {
  return Boolean(state.player.miniPlayerMode);
}

export function syncMiniPlayerButton(hasLoadedMedia) {
  const button = dom.playerMiniPlayerButton;
  if (!button) return;

  const active = isMiniPlayerActive();
  const label = active
    ? "Cancelar mini-reproductor y volver al video"
    : "Abrir mini-reproductor";
  button.disabled = !hasLoadedMedia && !active;
  button.classList.toggle("active", active);
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(active));
  button.dataset.tooltip = active
    ? "Cancelar mini-reproductor y volver al video"
    : "Mini-reproductor";
  const isInMainDocument = button.ownerDocument === document;
  if (isInMainDocument) button.removeAttribute("title");
  else button.title = label;
  const iconName = active ? "x" : "picture-in-picture-2";
  setControlIcon(button, iconName);
}

async function openDocumentPictureInPicture(chatWasOpen) {
  const pipWindow = await window.documentPictureInPicture.requestWindow({
    width: 520,
    height: 320,
  });
  pictureInPictureWindow = pipWindow;
  await installMiniPlayerWindowStyles(pipWindow.document);
  miniSurface = createMiniPlayerSurface(
    pipWindow.document,
    dom.playerFrame.dataset.chatStyle,
    chatWasOpen,
    dom.playerFrame.dataset.controlStyle,
  );
  pipWindow.document.body.append(miniSurface);
  miniPlayerInterface = movePlayerInterface(miniSurface);
  miniPlayerChat = mirrorMiniPlayerChatState(miniSurface, chatWasOpen);
  stopMiniPlayerOverlayControls = wireMiniPlayerOverlayControls(miniSurface, pipWindow);
  pipWindow.addEventListener("pagehide", restoreMainPlayer, { once: true });
  activateMiniPlayer("document");
}

async function openNativePictureInPicture() {
  wireNativePictureInPictureActions();
  await dom.videoPlayer.requestPictureInPicture();
  activateMiniPlayer("native");
}

function openInlineMiniPlayer(chatWasOpen) {
  miniSurface = createMiniPlayerSurface(
    document,
    dom.playerFrame.dataset.chatStyle,
    chatWasOpen,
    dom.playerFrame.dataset.controlStyle,
  );
  miniSurface.classList.add("mini-player-inline");
  dom.playerFrame.append(miniSurface);
  miniPlayerInterface = movePlayerInterface(miniSurface);
  miniPlayerChat = mirrorMiniPlayerChatState(miniSurface, chatWasOpen);
  stopMiniPlayerOverlayControls = wireMiniPlayerOverlayControls(miniSurface, window);
  activateMiniPlayer("inline");
}

function openScrollMiniPlayer() {
  miniSurface = createMiniPlayerSurface(
    document,
    dom.playerFrame.dataset.chatStyle,
    dom.playerFrame.classList.contains("chat-inside-open"),
    dom.playerFrame.dataset.controlStyle,
  );
  miniSurface.classList.add("mini-player-inline", "mini-player-scroll");
  miniSurface.classList.remove("player-overlay-visible");
  document.body.append(miniSurface);
  miniPlayerInterface = movePlayerInterface(miniSurface);
  miniPlayerChat = mirrorMiniPlayerChatState(
    miniSurface,
    dom.playerFrame.classList.contains("chat-inside-open"),
  );
  stopMiniPlayerOverlayControls = wireMiniPlayerOverlayControls(miniSurface, window);
  stopMiniPlayerDrag = wireMiniPlayerDrag(miniSurface);
  activateMiniPlayer("scroll");
}

function activateMiniPlayer(mode) {
  state.player.miniPlayerMode = mode;
  if (miniSurface) {
    miniSurface.classList.remove("mini-player-initializing");
    const surfaceToReveal = miniSurface;
    const reveal = () => {
      if (miniSurface !== surfaceToReveal) return;
      surfaceToReveal.style.removeProperty("visibility");
      surfaceToReveal.style.removeProperty("opacity");
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
  }
  dom.playerFrame.classList.add("mini-player-active");
  syncMiniPlayerButton(true);
  stopMiniPlayerReturnHintTracking = trackMiniPlayerReturnHint();
  setSyncStatus(mode === "scroll"
    ? "Video en miniatura mientras ves el chat."
    : "Mini-reproductor abierto.");
  logEvent("player", mode === "scroll"
    ? "Mini-reproductor flotante abierto al bajar al chat."
    : `Mini-reproductor abierto (${mode}).`);
}

async function closeMiniPlayer() {
  if (state.player.miniPlayerMode === "document" && pictureInPictureWindow && !pictureInPictureWindow.closed) {
    pictureInPictureWindow.close();
    return;
  }
  if (state.player.miniPlayerMode === "native" && document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    if (state.player.miniPlayerMode === "native") restoreMainPlayer();
    return;
  }
  restoreMainPlayer();
}

function restoreMainPlayer() {
  if (!state.player.miniPlayerMode) return;
  miniPlayerChat?.restore();
  miniPlayerChat = null;
  miniPlayerInterface?.restore();
  miniPlayerInterface = null;
  stopMiniPlayerDrag?.();
  stopMiniPlayerDrag = null;
  stopMiniPlayerOverlayControls?.();
  stopMiniPlayerOverlayControls = null;
  stopMiniPlayerReturnHintTracking?.();
  stopMiniPlayerReturnHintTracking = null;
  miniSurface?.remove();
  miniSurface = null;
  pictureInPictureWindow = null;
  dom.playerFrame.classList.remove("mini-player-active");
  state.player.miniPlayerMode = "";
  syncMiniPlayerButton(hasMedia());
  setSyncStatus("Video devuelto al reproductor principal.");
  logEvent("player", "Mini-reproductor cerrado sin pausar el video.");
}

function wireMiniPlayerOverlayControls(surface, ownerWindow) {
  let hideTimer = null;
  const clearHideTimer = () => {
    if (hideTimer) ownerWindow.clearTimeout(hideTimer);
    hideTimer = null;
  };
  const hide = () => {
    clearHideTimer();
    const activeSelect = ownerWindow.document.activeElement;
    if (activeSelect?.matches?.(".player-rate-select select, [data-proxy-for=\"playerRateSelect\"]")) {
      activeSelect.blur();
    }
    surface.classList.remove("player-overlay-visible");
  };
  const reveal = () => {
    if (surface.classList.contains("player-overlay-suppressed")) return;
    clearHideTimer();
    surface.classList.add("player-overlay-visible");
    hideTimer = ownerWindow.setTimeout(hide, 2200);
  };

  const revealForTouch = () => {
    if (surface.classList.contains("player-overlay-suppressed")) return;
    clearHideTimer();
    surface.classList.add("player-overlay-visible");
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "mouse") reveal();
  };
  const handleVideoPointerDown = (event) => {
    if (event.target !== dom.videoPlayer) return;
    if (!dom.videoPlayer.paused && !dom.videoPlayer.ended) return;
    clearHideTimer();
    surface.classList.remove("player-overlay-visible");
    surface.classList.add("player-overlay-suppressed");
    ownerWindow.setTimeout(() => {
      surface.classList.remove("player-overlay-suppressed");
    }, 700);
  };
  const handleMiniPlayerClose = (event) => {
    const button = event.target.closest?.(
      "#playerMiniPlayerButton, [data-proxy-for=\"playerMiniPlayerButton\"]",
    );
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void toggleMiniPlayer();
  };
  surface.addEventListener("click", handleMiniPlayerClose, true);
  surface.addEventListener("pointerdown", handleVideoPointerDown, true);
  surface.addEventListener("pointermove", handlePointerMove, { passive: true });
  surface.addEventListener("mouseenter", reveal);
  surface.addEventListener("mouseleave", hide);
  ownerWindow.addEventListener("blur", hide);
  const removeTouchHover = wireTouchHover(surface, {
    onActivate: revealForTouch,
    onDeactivate: hide,
    eventDocument: ownerWindow.document,
  });

  return () => {
    clearHideTimer();
    surface.removeEventListener("click", handleMiniPlayerClose, true);
    surface.removeEventListener("pointerdown", handleVideoPointerDown, true);
    surface.removeEventListener("pointermove", handlePointerMove);
    surface.removeEventListener("mouseenter", reveal);
    surface.removeEventListener("mouseleave", hide);
    ownerWindow.removeEventListener("blur", hide);
    removeTouchHover();
  };
}

function supportsDocumentPictureInPicture() {
  return typeof window.documentPictureInPicture?.requestWindow === "function";
}

function hasMedia() {
  return Boolean(dom.videoPlayer.currentSrc || dom.videoPlayer.getAttribute("src"));
}

function scheduleScrollMiniPlayerSync() {
  if (scrollMiniPlayerFrame) return;
  scrollMiniPlayerFrame = window.requestAnimationFrame(() => {
    scrollMiniPlayerFrame = 0;
    syncScrollMiniPlayer();
  });
}

function syncScrollMiniPlayer() {
  syncScrollMiniPlayerDismissalState();
  if (isMobileViewport()) {
    if (state.player.miniPlayerMode === "scroll") restoreMainPlayer();
    return;
  }

  const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
  if (!isBottomDock || !hasMedia()) {
    if (state.player.miniPlayerMode === "scroll") restoreMainPlayer();
    return;
  }

  const videoRect = dom.playerFrame?.getBoundingClientRect();
  const chatRect = dom.chatArea?.getBoundingClientRect();
  if (!videoRect || !chatRect) return;

  const chatIsVisible = chatRect.top < window.innerHeight && chatRect.bottom > 0;
  const videoIsMostlyOutOfView = videoRect.bottom < window.innerHeight * 0.6;
  const shouldFloat = chatIsVisible && videoIsMostlyOutOfView;

  if (!shouldFloat) {
    if (state.player.miniPlayerMode === "scroll") restoreMainPlayer();
    return;
  }

  if (
    !state.player.miniPlayerMode
    && !state.player.scrollMiniPlayerDismissed
  ) {
    openScrollMiniPlayer();
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

function dismissScrollMiniPlayerForSession() {
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

function wireNativePictureInPictureActions() {
  if (!navigator.mediaSession) return;
  const handlers = {
    play: () => { dom.videoPlayer.play().catch(() => {}); },
    pause: () => { dom.videoPlayer.pause(); },
    seekbackward: () => seekVideoBy(-10),
    seekforward: () => seekVideoBy(10),
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Algunos navegadores exponen Media Session sin todas las acciones.
    }
  });
}

function seekVideoBy(seconds) {
  const duration = Number.isFinite(dom.videoPlayer.duration) ? dom.videoPlayer.duration : 0;
  dom.videoPlayer.currentTime = duration > 0
    ? Math.min(duration, Math.max(0, dom.videoPlayer.currentTime + seconds))
    : Math.max(0, dom.videoPlayer.currentTime + seconds);
}

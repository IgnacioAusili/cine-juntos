import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const MINI_PLAYER_OVERLAY_IDLE_MS = 3000;
const MINI_PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS = 800;

export function wireMiniPlayerOverlayControls(surface, ownerWindow, onToggleMiniPlayer) {
  let hideTimer = null;
  let lastTouchPointerAt = 0;
  const isChatInteractionTarget = (target) => Boolean(target?.closest?.(
    ".player-chat, #playerChatToggleButton, [data-proxy-for=\"playerChatToggleButton\"]",
  ));
  const getPointerTarget = (event) => {
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return ownerWindow.document.elementFromPoint(event.clientX, event.clientY)
        || event.target;
    }
    return event?.target;
  };
  const clearHideTimer = () => {
    if (hideTimer) ownerWindow.clearTimeout(hideTimer);
    hideTimer = null;
  };
  const isMobileTouchDevice = () => ownerWindow.matchMedia?.(
    "(max-width: 980px) and (hover: none) and (pointer: coarse)",
  ).matches === true;
  const keepOverlayWhilePaused = () => isMobileTouchDevice()
    && (dom.videoPlayer.paused || dom.videoPlayer.ended);
  const hide = () => {
    clearHideTimer();
    const activeSelect = ownerWindow.document.activeElement;
    if (activeSelect?.matches?.(".player-rate-select select, [data-proxy-for=\"playerRateSelect\"]")) {
      activeSelect.blur();
    }
    surface.classList.remove("player-overlay-visible");
  };
  const scheduleHide = (delay = MINI_PLAYER_OVERLAY_IDLE_MS) => {
    clearHideTimer();
    if (keepOverlayWhilePaused()) return;
    const safeDelay = delay > 0 ? delay : MINI_PLAYER_OVERLAY_IDLE_MS;
    hideTimer = ownerWindow.setTimeout(() => {
      hideTimer = null;
      if (keepOverlayWhilePaused()) return;
      hide();
    }, safeDelay);
  };
  const resetHideTimerAfterControlClick = (event) => {
    const control = event.target?.closest?.(
      ".player-controls-bar button, .player-center-actions button",
    );
    if (!control || control.disabled) return;

    clearHideTimer();
    scheduleHide();
  };
  const reveal = (event) => {
    if (isChatInteractionTarget(event?.target)) return;
    if (
      isMobileTouchDevice()
      && event?.target === dom.videoPlayer
      && (event?.type === "mousedown" || event?.type === "mouseenter")
    ) return;
    if (surface.classList.contains("player-overlay-suppressed")) return;
    clearHideTimer();
    surface.classList.add("player-overlay-visible");
    scheduleHide();
  };

  const handlePointerMove = (event) => {
    if (event.pointerType !== "mouse") return;
    reveal({ target: getPointerTarget(event) });
  };
  const handleMouseDown = (event) => {
    if (event.target === dom.videoPlayer) return;
    reveal({ target: getPointerTarget(event) });
  };
  const handleSurfaceEnter = (event) => {
    reveal({ target: getPointerTarget(event) });
  };
  const handleSurfaceLeave = () => {
    const activeElement = ownerWindow.document.activeElement;
    if (
      activeElement
      && surface.contains(activeElement)
      && !activeElement.closest?.(".player-chat")
    ) {
      activeElement.blur();
    }
    scheduleHide(MINI_PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS);
  };
  const handleFocusIn = (event) => {
    reveal(event);
  };
  const handleFocusOut = (event) => {
    if (isChatInteractionTarget(event.relatedTarget)) return;
    scheduleHide(MINI_PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS);
  };
  const handleVideoPointerDown = (event) => {
    if (event.target !== dom.videoPlayer) return;
    if (isMobileTouchDevice()) {
      event.preventDefault();
      return;
    }
    if (!dom.videoPlayer.paused && !dom.videoPlayer.ended) return;
    clearHideTimer();
    surface.classList.remove("player-overlay-visible");
    surface.classList.add("player-overlay-suppressed");
    ownerWindow.setTimeout(() => {
      surface.classList.remove("player-overlay-suppressed");
    }, 700);
  };
  const toggleOverlayFromVideo = (event) => {
    if (event?.target !== dom.videoPlayer || !isMobileTouchDevice()) return;
    if (event.defaultPrevented) {
      lastTouchPointerAt = Date.now();
      return;
    }

    event.preventDefault();
    lastTouchPointerAt = Date.now();
    clearHideTimer();
    const isVisible = surface.classList.contains("player-overlay-visible");
    if (isVisible) {
      hide();
      return;
    }
    surface.classList.add("player-overlay-visible");
    scheduleHide();
  };
  const handleVideoPointerUp = (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      toggleOverlayFromVideo(event);
    }
  };
  const handleVideoTouchEnd = (event) => {
    if (Date.now() - lastTouchPointerAt > 300) toggleOverlayFromVideo(event);
  };
  const handleVideoClick = (event) => {
    if (event.target !== dom.videoPlayer || !isMobileTouchDevice()) return;
    if (Date.now() - lastTouchPointerAt <= 600) {
      event.preventDefault();
      return;
    }
    if (event.pointerType !== "mouse") toggleOverlayFromVideo(event);
  };
  const handleMiniPlayerClose = (event) => {
    const button = event.target.closest?.(
      "#playerMiniPlayerButton, [data-proxy-for=\"playerMiniPlayerButton\"]",
    );
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void onToggleMiniPlayer();
  };
  const handleCenterControlClick = (event) => {
    const button = event.target?.closest?.(".player-center-actions button");
    if (!button || button.disabled) return;
    button.classList.remove("is-click-bouncing");
    void button.offsetWidth;
    button.classList.add("is-click-bouncing");
  };
  surface.addEventListener("click", handleMiniPlayerClose, true);
  surface.addEventListener("click", resetHideTimerAfterControlClick);
  surface.addEventListener("click", handleCenterControlClick);
  surface.addEventListener("pointerdown", handleVideoPointerDown, true);
  dom.videoPlayer.addEventListener("pointerup", handleVideoPointerUp, { passive: false });
  dom.videoPlayer.addEventListener("touchend", handleVideoTouchEnd, { passive: false });
  dom.videoPlayer.addEventListener("click", handleVideoClick);
  surface.addEventListener("pointermove", handlePointerMove, { passive: true });
  surface.addEventListener("mousedown", handleMouseDown);
  surface.addEventListener("mouseenter", handleSurfaceEnter);
  surface.addEventListener("mouseleave", handleSurfaceLeave);
  surface.addEventListener("focusin", handleFocusIn);
  surface.addEventListener("focusout", handleFocusOut);

  return () => {
    clearHideTimer();
    surface.removeEventListener("click", handleMiniPlayerClose, true);
    surface.removeEventListener("click", resetHideTimerAfterControlClick);
    surface.removeEventListener("click", handleCenterControlClick);
    surface.removeEventListener("pointerdown", handleVideoPointerDown, true);
    dom.videoPlayer.removeEventListener("pointerup", handleVideoPointerUp);
    dom.videoPlayer.removeEventListener("touchend", handleVideoTouchEnd);
    dom.videoPlayer.removeEventListener("click", handleVideoClick);
    surface.removeEventListener("pointermove", handlePointerMove);
    surface.removeEventListener("mousedown", handleMouseDown);
    surface.removeEventListener("mouseenter", handleSurfaceEnter);
    surface.removeEventListener("mouseleave", handleSurfaceLeave);
    surface.removeEventListener("focusin", handleFocusIn);
    surface.removeEventListener("focusout", handleFocusOut);
  };
}

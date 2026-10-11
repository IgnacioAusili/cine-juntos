import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const MOBILE_OVERLAY_TOGGLE_LOCK_MS = 320;

export function wireMobileVideoOverlayGestures({ touchState, isMobileTouchDevice, clearHideTimer, isInlinePlayerDialogVisible, setOverlayVisible, scheduleHide }) {
const isTouchPointer = (event) => event?.pointerType === "touch" || event?.pointerType === "pen";
  const VIDEO_GESTURE_MOVE_THRESHOLD = 10;
  const supportsPointerEvents = "PointerEvent" in window;
  let lastTouchPointerAt = 0;
  let activeVideoTouchGesture = null;
  let mobileTouchHidVisibleOverlay = false;
  let mobileOverlayLockedUntil = 0;
  const trackVideoTouchStart = (event) => {
    if (
      event.target !== dom.videoPlayer
      || !isMobileTouchDevice()
      || !isTouchPointer(event)
    ) return;

    touchState.mobileTouchInteractionActive = true;
    clearHideTimer();
    if (Date.now() < mobileOverlayLockedUntil) {
      activeVideoTouchGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        blocked: true,
      };
      return;
    }
    // El inicio solo registra el estado. La barra se alterna al soltar, nunca
    // mientras el dedo permanece apoyado sobre el video.
    mobileTouchHidVisibleOverlay = dom.playerFrame.classList.contains("player-overlay-visible");
    activeVideoTouchGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };
  const trackVideoTouchMove = (event) => {
    if (!activeVideoTouchGesture || event.pointerId !== activeVideoTouchGesture.pointerId) return;
    if (
      Math.hypot(
        event.clientX - activeVideoTouchGesture.startX,
        event.clientY - activeVideoTouchGesture.startY,
      ) >= VIDEO_GESTURE_MOVE_THRESHOLD
    ) {
      activeVideoTouchGesture.moved = true;
      // El navegador puede emitir mousemove sintéticos durante o justo
      // después del arrastre táctil. No deben revelar ni alternar el overlay.
      touchState.suppressMobileVideoRevealUntil = Date.now() + 700;
    }
  };
  const finishVideoTouchGesture = (event) => {
    if (!activeVideoTouchGesture || event.pointerId !== activeVideoTouchGesture.pointerId) return false;
    const moved = activeVideoTouchGesture.moved;
    const blocked = activeVideoTouchGesture.blocked;
    activeVideoTouchGesture = null;
    if (blocked) return true;
    if (moved || event.target !== dom.videoPlayer) lastTouchPointerAt = Date.now();
    return moved;
  };
  const toggleOverlayFromVideo = (event) => {
    if (
      event?.target !== dom.videoPlayer
      || dom.videoPlayer.closest(".mini-player-surface")
      || !isMobileTouchDevice()
    ) return;

    if (event.defaultPrevented) {
      lastTouchPointerAt = Date.now();
      touchState.mobileTouchInteractionActive = false;
      mobileTouchHidVisibleOverlay = false;
      return;
    }

    event.preventDefault();
    lastTouchPointerAt = Date.now();
    touchState.mobileTouchInteractionActive = false;
    // El gesto se resuelve al soltar; bloquear los eventos de mouse
    // sintéticos posteriores evita que la barra rebote inmediatamente.
    touchState.suppressMobileVideoRevealUntil = Date.now() + 700;
    if (dom.playerFrame.classList.contains("player-no-content")) {
      mobileTouchHidVisibleOverlay = false;
      touchState.suppressMobileVideoRevealUntil = 0;
      dom.playerFrame.classList.remove("player-cursor-hidden");
      setOverlayVisible(true);
      return;
    }
    mobileTouchHidVisibleOverlay = false;
    clearHideTimer();
    const isVisible = dom.playerFrame.classList.contains("player-overlay-visible");
    if (isVisible) {
      hideTooltip(true);
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-cursor-hidden");
      return;
    }

    dom.playerFrame.classList.remove("player-cursor-hidden");
    setOverlayVisible(true);
    mobileOverlayLockedUntil = Date.now() + MOBILE_OVERLAY_TOGGLE_LOCK_MS;
    scheduleHide();
  };
  dom.videoPlayer.addEventListener("pointerdown", trackVideoTouchStart, { passive: true });
  window.addEventListener("pointermove", trackVideoTouchMove, { passive: true });
  dom.videoPlayer.addEventListener("pointerup", (event) => {
    if (!isTouchPointer(event)) return;
    if (finishVideoTouchGesture(event)) return;
    toggleOverlayFromVideo(event);
  }, { passive: false });
  document.addEventListener("pointerup", (event) => {
    if (!isTouchPointer(event)) return;
    finishVideoTouchGesture(event);
  }, { passive: true });
  document.addEventListener("pointercancel", (event) => {
    if (!isTouchPointer(event)) return;
    activeVideoTouchGesture = null;
    touchState.mobileTouchInteractionActive = false;
    mobileTouchHidVisibleOverlay = false;
  }, { passive: true });
  if (!supportsPointerEvents) {
    let activeLegacyTouchGesture = null;
    const getLegacyTouchPoint = (event) => {
      const touch = event.changedTouches?.[0];
      return touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
    };
    dom.videoPlayer.addEventListener("touchstart", (event) => {
      if (!isMobileTouchDevice() || event.target !== dom.videoPlayer) return;
      const point = getLegacyTouchPoint(event);
      if (!point) return;
      touchState.mobileTouchInteractionActive = true;
      clearHideTimer();
      if (Date.now() < mobileOverlayLockedUntil) {
        activeLegacyTouchGesture = { ...point, moved: false, blocked: true };
        return;
      }
      mobileTouchHidVisibleOverlay = dom.playerFrame.classList.contains("player-overlay-visible");
      activeLegacyTouchGesture = { ...point, moved: false };
    }, { passive: true });
    dom.videoPlayer.addEventListener("touchmove", (event) => {
      if (!activeLegacyTouchGesture) return;
      const point = getLegacyTouchPoint(event);
      if (!point || point.id !== activeLegacyTouchGesture.id) return;
      if (
        Math.hypot(
          point.x - activeLegacyTouchGesture.x,
          point.y - activeLegacyTouchGesture.y,
        ) >= VIDEO_GESTURE_MOVE_THRESHOLD
      ) {
        activeLegacyTouchGesture.moved = true;
      }
    }, { passive: true });
    dom.videoPlayer.addEventListener("touchend", (event) => {
      if (!activeLegacyTouchGesture) return;
      const moved = activeLegacyTouchGesture.moved;
      const blocked = activeLegacyTouchGesture.blocked;
      activeLegacyTouchGesture = null;
      if (blocked || moved) {
        lastTouchPointerAt = Date.now();
        return;
      }
      toggleOverlayFromVideo(event);
    }, { passive: false });
    dom.videoPlayer.addEventListener("touchcancel", () => {
      activeLegacyTouchGesture = null;
    }, { passive: true });
  }
}

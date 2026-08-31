import { dom } from "../../core/dom.js";

// En landscape un telefono sigue siendo tactil aunque su ancho supere el
// breakpoint de la vista vertical. La interaccion del video debe seguir la
// misma secuencia de revelar / reproducir en ambas orientaciones.
const MOBILE_PLAYER_MEDIA_QUERY = "(max-width: 680px), (hover: none) and (pointer: coarse)";
const MOBILE_CLICK_GUARD_MS = 600;
const MOBILE_TOUCH_DEDUP_MS = 250;
const MOBILE_REVEAL_PENDING_MS = 700;
const VIDEO_CLICK_DELAY_MS = 220;

export function wireVideoClickToggle({ togglePlayback, consumeVolumeGesture } = {}) {
  if (!dom.videoPlayer || typeof togglePlayback !== "function") return;

  let videoClickTimer = null;
  let videoClickOverlayTimer = null;
  let mobileRevealOnlyTapPending = false;
  let mobileRevealOnlyTapTimer = null;
  let mobileTouchClickHandledUntil = 0;
  let touchSequence = null;
  let lastPointerTouchAt = 0;

  const getSurface = () => dom.videoPlayer.closest(".mini-player-surface") || dom.playerFrame;
  const isMobile = () => window.matchMedia(MOBILE_PLAYER_MEDIA_QUERY).matches;
  const isTouchPointer = (event) => event?.pointerType === "touch" || event?.pointerType === "pen";

  const clearRevealPending = () => {
    mobileRevealOnlyTapPending = false;
    if (mobileRevealOnlyTapTimer) window.clearTimeout(mobileRevealOnlyTapTimer);
    mobileRevealOnlyTapTimer = null;
  };

  const armRevealPending = () => {
    clearRevealPending();
    mobileRevealOnlyTapPending = true;
    mobileRevealOnlyTapTimer = window.setTimeout(clearRevealPending, MOBILE_REVEAL_PENDING_MS);
  };

  const markTouchClickHandled = () => {
    mobileTouchClickHandledUntil = Date.now() + MOBILE_CLICK_GUARD_MS;
  };

  const revealMobileControls = () => {
    const surface = getSurface();
    if (!surface) return;
    if (videoClickOverlayTimer) window.clearTimeout(videoClickOverlayTimer);
    surface.classList.remove("player-overlay-suppressed");
    surface.classList.add("player-overlay-visible");
    videoClickOverlayTimer = window.setTimeout(() => {
      surface.classList.remove("player-overlay-visible");
      videoClickOverlayTimer = null;
    }, 3000);
  };

  const hideControlsForPlayback = () => {
    const surface = getSurface();
    if (!surface) return;
    if (videoClickOverlayTimer) window.clearTimeout(videoClickOverlayTimer);
    surface.classList.remove("player-overlay-visible");
    surface.classList.add("player-overlay-suppressed");
    videoClickOverlayTimer = window.setTimeout(() => {
      surface.classList.remove("player-overlay-suppressed");
      videoClickOverlayTimer = null;
    }, 700);
  };

  const finishTouchSequence = (event) => {
    const action = touchSequence?.action;
    if (!action) return;
    touchSequence = null;
    if (action !== "toggle") return;

    const surface = getSurface();
    if (surface?.classList.contains("player-volume-gesture-active")) {
      markTouchClickHandled();
      return;
    }
    event?.preventDefault?.();
    if (dom.videoPlayer.paused || dom.videoPlayer.ended) hideControlsForPlayback();
    togglePlayback();
    markTouchClickHandled();
  };

  const beginTouchSequence = (event, source) => {
    const surface = getSurface();
    const action = surface?.classList.contains("player-overlay-visible") ? "toggle" : "reveal";
    touchSequence = {
      action,
      pointerId: event.pointerId ?? null,
      source,
      startedAt: Date.now(),
    };
    event.preventDefault();
    if (action === "reveal") {
      armRevealPending();
      revealMobileControls();
    }
  };

  const handlePointerDown = (event) => {
    if (!isMobile() || !isTouchPointer(event)) return;
    const now = Date.now();
    lastPointerTouchAt = now;
    if (touchSequence?.source === "touch" && now - touchSequence.startedAt <= MOBILE_TOUCH_DEDUP_MS) {
      // Algunos navegadores emiten pointerdown después de touchstart. Es el
      // mismo gesto: solo completaremos la acción con touchend.
      touchSequence.pointerId = event.pointerId;
      return;
    }
    beginTouchSequence(event, "pointer");
  };

  const handlePointerUp = (event) => {
    if (touchSequence?.source !== "pointer" || touchSequence.pointerId !== event.pointerId) return;
    finishTouchSequence(event);
  };

  const handlePointerCancel = (event) => {
    if (touchSequence?.pointerId !== event.pointerId) return;
    touchSequence = null;
    clearRevealPending();
  };

  const handleTouchStart = (event) => {
    if (!isMobile() || touchSequence?.source === "pointer") return;
    if (Date.now() - lastPointerTouchAt <= MOBILE_TOUCH_DEDUP_MS) return;
    beginTouchSequence(event, "touch");
  };

  const handleTouchEnd = (event) => {
    if (touchSequence?.source !== "touch") return;
    finishTouchSequence(event);
  };

  dom.videoPlayer.addEventListener("pointerdown", handlePointerDown, { passive: false });
  dom.videoPlayer.addEventListener("pointerup", handlePointerUp, { passive: false });
  dom.videoPlayer.addEventListener("pointercancel", handlePointerCancel, { passive: false });
  dom.videoPlayer.addEventListener("touchstart", handleTouchStart, { passive: false });
  dom.videoPlayer.addEventListener("touchend", handleTouchEnd, { passive: false });

  dom.videoPlayer.addEventListener("click", (event) => {
    if (consumeVolumeGesture?.()) {
      event.preventDefault();
      return;
    }
    if (Date.now() < mobileTouchClickHandledUntil) {
      event.preventDefault();
      return;
    }
    if (mobileRevealOnlyTapPending) {
      clearRevealPending();
      event.preventDefault();
      return;
    }

    const mobile = isMobile();
    const surface = getSurface();
    const isFirstMobileTap = mobile && !surface?.classList.contains("player-overlay-visible");

    if (mobile) {
      event.preventDefault();
      // En la ruta de fallback no hay pointerup que complete el gesto. Resolver
      // aquí evita que el video y la barra queden desfasados 220 ms.
      if (isFirstMobileTap) {
        revealMobileControls();
        return;
      }
      if (dom.videoPlayer.paused || dom.videoPlayer.ended) hideControlsForPlayback();
      togglePlayback();
      return;
    }

    if (videoClickTimer) window.clearTimeout(videoClickTimer);
    videoClickTimer = window.setTimeout(() => {
      videoClickTimer = null;
      if (dom.videoPlayer.paused || dom.videoPlayer.ended) hideControlsForPlayback();
      togglePlayback();
    }, VIDEO_CLICK_DELAY_MS);
  });

  dom.videoPlayer.addEventListener("dblclick", () => {
    if (!videoClickTimer) return;
    window.clearTimeout(videoClickTimer);
    videoClickTimer = null;
  });
}

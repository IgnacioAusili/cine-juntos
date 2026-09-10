const LANDSCAPE_BOTTOM_CHAT_QUERY =
  "(max-width: 980px) and (max-height: 500px) and (orientation: landscape)";
const SNAP_THRESHOLD_RATIO = 0.12;
const FALLBACK_SETTLE_DELAY = 240;
const SMOOTH_SETTLE_TIMEOUT = 600;

function isEligible() {
  return window.matchMedia(LANDSCAPE_BOTTOM_CHAT_QUERY).matches
    && document.documentElement.classList.contains("viewport-landscape")
    && !document.documentElement.classList.contains("bottom-chat-keyboard-open")
    && !document.body.classList.contains("is-lobby")
    && !document.body.classList.contains("fullscreen-mode")
    && document.querySelector('.session-view[data-chat-dock="bottom"]');
}

function getVideoSnapTarget() {
  const videoArea = document.querySelector(
    '.session-view[data-chat-dock="bottom"] .video-area',
  );
  if (!videoArea) return null;

  const rect = videoArea.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    height: rect.height,
  };
}

export function wireMobileLandscapeVideoSnap() {
  let settleTimer = 0;
  let smoothSettleTimer = 0;
  let pointerActive = false;
  let smoothSettling = false;

  const cancelSmoothSettle = () => {
    if (!smoothSettling) return;

    smoothSettling = false;
    window.clearTimeout(smoothSettleTimer);
    smoothSettleTimer = 0;
    window.scrollTo({ top: window.scrollY, behavior: "auto" });
  };

  const settleNearVideo = () => {
    if (pointerActive || smoothSettling || !isEligible()) return;

    const target = getVideoSnapTarget();
    if (!target || target.height <= 0) return;

    const distance = Math.abs(window.scrollY - target.top);
    if (distance === 0 || distance > target.height * SNAP_THRESHOLD_RATIO) return;

    smoothSettling = true;
    window.scrollTo({ top: target.top, behavior: "smooth" });
    smoothSettleTimer = window.setTimeout(() => {
      smoothSettling = false;
      smoothSettleTimer = 0;
    }, SMOOTH_SETTLE_TIMEOUT);
  };

  const scheduleSettle = () => {
    if (pointerActive) return;

    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      settleNearVideo();
    }, FALLBACK_SETTLE_DELAY);
  };

  const handlePointerDown = () => {
    pointerActive = true;
    window.clearTimeout(settleTimer);
    cancelSmoothSettle();
  };

  const handlePointerEnd = () => {
    pointerActive = false;
    scheduleSettle();
  };

  window.addEventListener("pointerdown", handlePointerDown, {
    capture: true,
    passive: true,
  });
  window.addEventListener("pointerup", handlePointerEnd, {
    capture: true,
    passive: true,
  });
  window.addEventListener("pointercancel", handlePointerEnd, {
    capture: true,
    passive: true,
  });
  window.addEventListener("scroll", scheduleSettle, { passive: true });
  document.addEventListener("scrollend", settleNearVideo, { passive: true });
}

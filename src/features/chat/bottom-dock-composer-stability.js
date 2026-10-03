const sessionView = document.getElementById("sessionView");
const chatArea = sessionView?.querySelector(".chat-area");
const messageForm = chatArea?.querySelector(":scope > .message-form");
const SETTLING_CLASS = "chat-bottom-composer-settling";
const MOTION_CLASSES = [
  "chat-dock-handle-switching",
  "chat-dock-switching",
  "chat-layout-transitioning",
  "chat-bottom-pc-expand-visual",
  "chat-bottom-mobile-expand-visual",
  "chat-bottom-mobile-curtain-active",
  "chat-dock-mobile-transition-in",
  "chat-dock-mobile-transition-in-active",
];
const STABLE_POSITION_DURATION_MS = 240;
const GEOMETRY_STABILITY_TOLERANCE_PX = 1.5;
const MAX_SETTLE_WAIT_MS = 8000;

let previousDock = sessionView?.dataset.chatDock || "right";
let settleFrameId = 0;
let settleTimeoutId = 0;
let stableSince = 0;
let stableGeometry = null;

function hasDockMotion() {
  return MOTION_CLASSES.some((name) => sessionView.classList.contains(name));
}

function stopWaiting() {
  if (settleFrameId) window.cancelAnimationFrame(settleFrameId);
  if (settleTimeoutId) window.clearTimeout(settleTimeoutId);
  settleFrameId = 0;
  settleTimeoutId = 0;
  resetStablePosition();
  sessionView?.classList.remove(SETTLING_CLASS);
}

function readGeometry() {
  const chatRect = chatArea.getBoundingClientRect();
  const formRect = messageForm.getBoundingClientRect();
  return {
    chatTop: chatRect.top,
    formTop: formRect.top,
    formBottom: formRect.bottom,
  };
}

function resetStablePosition() {
  stableSince = 0;
  stableGeometry = null;
}

function geometryStayedStable(current) {
  const moved = stableGeometry && Object.keys(current).some(
    (key) => Math.abs(current[key] - stableGeometry[key]) >= GEOMETRY_STABILITY_TOLERANCE_PX,
  );
  if (!stableGeometry || moved) {
    stableGeometry = { ...current };
    stableSince = performance.now();
    return false;
  }
  return performance.now() - stableSince >= STABLE_POSITION_DURATION_MS;
}

function isAtFinalBottomPosition(geometry) {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  return Math.abs(geometry.chatTop) <= 2
    && geometry.formTop >= -1
    && geometry.formBottom <= viewportHeight + 1;
}

function checkSettledPosition() {
  settleFrameId = 0;
  if (!sessionView?.classList.contains(SETTLING_CLASS)) return;

  if (
    sessionView.dataset.chatDock !== "bottom"
    || sessionView.classList.contains("chat-collapsed")
  ) {
    stopWaiting();
    return;
  }

  const geometry = readGeometry();
  const canSettle = !hasDockMotion() && isAtFinalBottomPosition(geometry);
  if (canSettle && geometryStayedStable(geometry)) {
    stopWaiting();
    return;
  }
  if (!canSettle) resetStablePosition();

  settleFrameId = window.requestAnimationFrame(checkSettledPosition);
}

function waitForBottomPosition() {
  if (!sessionView || !chatArea || !messageForm) return;
  if (sessionView.classList.contains(SETTLING_CLASS)) return;

  resetStablePosition();
  sessionView.classList.add(SETTLING_CLASS);
  settleTimeoutId = window.setTimeout(stopWaiting, MAX_SETTLE_WAIT_MS);
  settleFrameId = window.requestAnimationFrame(checkSettledPosition);
}

if (sessionView && chatArea && messageForm) {
  const dockObserver = new MutationObserver(() => {
    const nextDock = sessionView.dataset.chatDock || "right";
    if (nextDock !== previousDock) {
      if (
        previousDock === "right"
        && nextDock === "bottom"
        && sessionView.classList.contains("chat-dock-handle-switching")
      ) {
        waitForBottomPosition();
      } else if (nextDock !== "bottom") {
        stopWaiting();
      }
      previousDock = nextDock;
    }

    if (
      sessionView.classList.contains(SETTLING_CLASS)
      && sessionView.classList.contains("chat-collapsed")
      && !hasDockMotion()
    ) {
      stopWaiting();
    }
  });

  dockObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["class", "data-chat-dock"],
  });
}

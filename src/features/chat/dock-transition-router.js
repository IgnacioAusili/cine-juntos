export const CHAT_DOCK_TRANSITIONS = Object.freeze({
  BOTTOM_TO_RIGHT: "bottom-to-right",
  FULLSCREEN_BOTTOM_TO_RIGHT: "fullscreen-bottom-to-right",
  FULLSCREEN: "fullscreen",
  RIGHT_TO_BOTTOM_NATIVE: "right-to-bottom-native",
  RIGHT_TO_BOTTOM_MOBILE: "right-to-bottom-mobile",
});

export function resolveChatDockTransition({
  currentDock,
  nextDock,
  skipTransition,
  isCollapsed,
  isFullscreen,
  isStacked,
  isMobilePortrait,
}) {
  if (skipTransition || currentDock === nextDock) return null;

  if (currentDock === "bottom" && nextDock === "right") {
    return isFullscreen && !isStacked
      ? CHAT_DOCK_TRANSITIONS.FULLSCREEN_BOTTOM_TO_RIGHT
      : CHAT_DOCK_TRANSITIONS.BOTTOM_TO_RIGHT;
  }

  if (isFullscreen && !isCollapsed) {
    if (currentDock === "right" && nextDock === "bottom" && !isStacked) {
      return CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_NATIVE;
    }
    return CHAT_DOCK_TRANSITIONS.FULLSCREEN;
  }

  if (currentDock === "right" && nextDock === "bottom" && !isCollapsed) {
    return isMobilePortrait
      ? CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_MOBILE
      : CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_NATIVE;
  }

  return null;
}

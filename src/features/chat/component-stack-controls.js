const COMPONENT_STACK_CLASS = "layout-component-stack";
const HEADER_VISUAL_CENTER_OFFSET_PROPERTY = "--component-stack-chat-header-visual-center-offset";

export function syncComponentStackChatHandle(sessionView, chatArea) {
  if (!sessionView) return;
  if (
    sessionView.dataset.chatDock !== "bottom"
    || !sessionView.classList.contains(COMPONENT_STACK_CLASS)
    || sessionView.classList.contains("chat-collapsed")
  ) {
    sessionView.style.removeProperty(HEADER_VISUAL_CENTER_OFFSET_PROPERTY);
    return;
  }

  const chatAreaStyle = getComputedStyle(chatArea);
  const chatRowGap = Number.parseFloat(chatAreaStyle.rowGap) || 0;
  const isCompactDesktopLandscape = window.matchMedia(
    "(max-width: 680px) and (orientation: landscape) and (hover: hover) and (pointer: fine)",
  ).matches;
  const visualCenterOffset = isCompactDesktopLandscape ? chatRowGap / 2 : 0;

  sessionView.style.setProperty(
    HEADER_VISUAL_CENTER_OFFSET_PROPERTY,
    `${visualCenterOffset}px`,
  );
}

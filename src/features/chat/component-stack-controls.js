const COMPONENT_STACK_CLASS = "layout-component-stack";
const HANDLE_TOP_PROPERTY = "--component-stack-chat-header-handle-top";
const HEADER_VISUAL_CENTER_OFFSET_PROPERTY = "--component-stack-chat-header-visual-center-offset";

export function syncComponentStackChatHandle(sessionView, chatArea) {
  if (!sessionView) return;
  if (
    sessionView.dataset.chatDock !== "bottom"
    || !sessionView.classList.contains(COMPONENT_STACK_CLASS)
    || sessionView.classList.contains("chat-collapsed")
  ) {
    sessionView.style.removeProperty(HANDLE_TOP_PROPERTY);
    sessionView.style.removeProperty(HEADER_VISUAL_CENTER_OFFSET_PROPERTY);
    return;
  }

  const chatRect = chatArea?.getBoundingClientRect();
  const header = chatArea?.querySelector(".chat-tools");
  const headerRect = header?.getBoundingClientRect();
  if (!chatRect?.height || !headerRect?.height) return;

  const chatBorderTop = Number.parseFloat(getComputedStyle(chatArea).borderTopWidth) || 0;
  const chatAreaStyle = getComputedStyle(chatArea);
  const chatRowGap = Number.parseFloat(chatAreaStyle.rowGap) || 0;
  const isCompactDesktopLandscape = window.matchMedia(
    "(max-width: 680px) and (orientation: landscape) and (hover: hover) and (pointer: fine)",
  ).matches;
  const visualCenterOffset = isCompactDesktopLandscape ? chatRowGap / 2 : 0;
  const headerStyle = getComputedStyle(header);
  const paddingTop = Number.parseFloat(headerStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(headerStyle.paddingBottom) || 0;
  const contentCenterCorrection = (paddingTop - paddingBottom) / 2;
  const headerCenter = headerRect.top - chatRect.top - chatBorderTop
    + headerRect.height / 2 - contentCenterCorrection + visualCenterOffset;

  sessionView.style.setProperty(
    HEADER_VISUAL_CENTER_OFFSET_PROPERTY,
    `${visualCenterOffset}px`,
  );

  sessionView.style.setProperty(
    HANDLE_TOP_PROPERTY,
    `${Math.max(0, headerCenter)}px`,
  );
}

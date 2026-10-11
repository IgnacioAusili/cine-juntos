import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { layoutMetricsState } from "./layout-metrics-state.js?v=20261010-file-size-refactor-02";
import { isMobileLayout, isFullscreenActive, isOverlayChatInputFocused, isBottomChatKeyboardTarget, isBottomChatNameEditorFocused, isBottomChatInputFocused, isBottomChatKeyboardOpen, isRightChatInputFocused } from "./layout-viewport-query.js?v=20261010-file-size-refactor-02";
import { getLargeViewportHeight, getCurrentViewportHeight } from "./layout-viewport-page-scroll.js?v=20261010-file-size-refactor-02";
export { isMobileLayout, isFullscreenActive, isOverlayChatInputFocused, isBottomChatKeyboardTarget, isBottomChatNameEditorFocused, isBottomChatInputFocused, isBottomChatKeyboardOpen, isRightChatInputFocused } from "./layout-viewport-query.js?v=20261010-file-size-refactor-02";
export { getLargeViewportHeight, getCurrentViewportHeight, getNativePageScrollMax, captureOrientationScrollPosition, restoreOrientationScrollPosition, scheduleOrientationScrollRestore, rememberNativePageScrollPosition, preservePageBottomAfterViewportChange } from "./layout-viewport-page-scroll.js?v=20261010-file-size-refactor-02";

export function isRightChatKeyboardOpen(viewportHeight = getCurrentViewportHeight()) {
  const referenceHeight = layoutMetricsState.lastViewportMetrics?.height || getLargeViewportHeight();
  return isRightChatInputFocused()
    && viewportHeight > 0
    && referenceHeight - viewportHeight > 80;
}
export function captureRightChatKeyboardScroll(allowUnfocused = false) {
  if (
    !isMobileLayout()
    || (!allowUnfocused && !isRightChatInputFocused())
    || layoutMetricsState.rightChatScrollBeforeKeyboard !== null
  ) return;

  layoutMetricsState.rightChatScrollBeforeKeyboard = window.scrollY || 0;
  layoutMetricsState.rightChatPageScrollLockTop = layoutMetricsState.rightChatScrollBeforeKeyboard;
}

export function alignRightChatKeyboardViewport() {
  if (!document.documentElement.classList.contains("right-chat-keyboard-open")) return;

  const targetTop = layoutMetricsState.rightChatPageScrollLockTop;
  if (targetTop === null || Math.abs((window.scrollY || 0) - targetTop) <= 1) return;
  window.scrollTo({ top: targetTop, behavior: "auto" });
}

export function restoreRightChatKeyboardScroll() {
  const targetTop = layoutMetricsState.rightChatScrollBeforeKeyboard;
  layoutMetricsState.rightChatScrollBeforeKeyboard = null;
  layoutMetricsState.rightChatPageScrollLockTop = null;
  if (targetTop === null) return;

  window.requestAnimationFrame(() => {
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    window.scrollTo({
      top: Math.min(targetTop, maxScroll),
      behavior: "auto",
    });
  });
}

function isRightChatScrollableTarget(target) {
  return target instanceof Element
    && (
      target === dom.videoPlayer
      || Boolean(target.closest([
        ".session-view[data-chat-dock=\"right\"] .messages",
        ".session-view[data-chat-dock=\"right\"] .chat-scrollbar",
        ".session-view[data-chat-dock=\"right\"] textarea",
      ].join(",")))
    );
}

export function preventRightChatPageScroll(event) {
  if (!document.documentElement.classList.contains("right-chat-keyboard-open")) return;
  if (isRightChatScrollableTarget(event.target)) return;
  event.preventDefault();
}

export function captureBottomChatKeyboardHandlePosition() {
  const activeHandleButton = dom.sessionView?.classList.contains("chat-collapsed")
    ? dom.expandChatButton
    : dom.collapseChatButton;
  const handleZone = activeHandleButton?.closest(".chat-collapse-hover-zone");
  if (
    !handleZone
    // The expanded bottom-dock arrow now belongs to the header grid. Keep it
    // there on input focus; workspace anchoring uses a different coordinate
    // space and would pull the arrow out of its centered column.
    || handleZone.parentElement?.classList.contains("chat-tools")
    || !isMobileLayout()
    || dom.sessionView?.dataset.chatDock !== "bottom"
    || layoutMetricsState.bottomChatKeyboardHandleAnchor?.handleZone === handleZone
  ) return;

  const rect = handleZone.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const positioningParent = handleZone.offsetParent || dom.workspace;
  const positioningParentRect = positioningParent?.getBoundingClientRect();
  if (!positioningParentRect) return;

  const properties = [
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "transform",
    "transition",
    // La reubicación del handle durante el teclado aplica opacity inline.
    // También hay que guardar/restaurar esa propiedad para que no quede
    // invisible después de cerrar el teclado y ocultar el header.
    "opacity",
  ];
  layoutMetricsState.bottomChatKeyboardHandleAnchor = {
    handleZone,
    positioningParent,
    initialTop: rect.top + rect.height / 2 - positioningParentRect.top,
    inlineStyles: Object.fromEntries(
      properties.map((property) => [
        property,
        {
          value: handleZone.style.getPropertyValue(property),
          priority: handleZone.style.getPropertyPriority(property),
        },
      ]),
    ),
  };

  // El handle vive dentro de un contexto de posicionamiento propio. Usar
  // absolute y expresar el top relativo a su offsetParent evita que un fixed
  // se teletransporte al borde del header cuando el contenedor tiene transform.
  handleZone.style.setProperty("position", "absolute");
  handleZone.style.setProperty("top", `${layoutMetricsState.bottomChatKeyboardHandleAnchor.initialTop}px`);
  handleZone.style.setProperty("right", "auto");
  handleZone.style.setProperty("bottom", "auto");
  handleZone.style.setProperty("left", "50%");
  handleZone.style.setProperty("transform", "translate(-50%, -50%)");
  handleZone.style.setProperty(
    "transition",
    "opacity 180ms ease, color 160ms ease, background 160ms ease",
  );
}

export function restoreBottomChatKeyboardHandlePosition() {
  const anchor = layoutMetricsState.bottomChatKeyboardHandleAnchor;
  layoutMetricsState.bottomChatKeyboardHandleAnchor = null;
  if (!anchor?.handleZone) return;

  Object.entries(anchor.inlineStyles).forEach(([property, inlineStyle]) => {
    if (inlineStyle.value) {
      anchor.handleZone.style.setProperty(property, inlineStyle.value, inlineStyle.priority);
    } else {
      anchor.handleZone.style.removeProperty(property);
    }
  });
}

function isBottomChatScrollableTarget(target) {
  return target instanceof Element
    && (
      target === dom.videoPlayer
      || Boolean(target.closest([
        ".session-view[data-chat-dock=\"bottom\"] .messages",
        ".session-view[data-chat-dock=\"bottom\"] .chat-scrollbar",
        ".session-view[data-chat-dock=\"bottom\"] textarea",
      ].join(",")))
    );
}

export function preventBottomChatPageScroll(event) {
  if (!isBottomChatKeyboardOpen() || isBottomChatScrollableTarget(event.target)) return;
  event.preventDefault();
}

export function restoreBottomChatPageScrollPosition() {
  if (!isBottomChatKeyboardOpen() || !Number.isFinite(layoutMetricsState.bottomChatPageScrollLockTop)) return;

  const currentTop = window.scrollY || 0;
  if (Math.abs(currentTop - layoutMetricsState.bottomChatPageScrollLockTop) > 1) {
    window.scrollTo({ top: layoutMetricsState.bottomChatPageScrollLockTop, behavior: "auto" });
  }
}

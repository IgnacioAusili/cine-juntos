// Controla la cabecera del chat inferior en pantallas tactiles.
import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js?v=20260902-mobile-real-browser-01";
import { hideTooltip } from "../icons-tooltips.js?v=20260904-help-invite-fixes-02";

const MOBILE_QUERY = "(max-width: 680px)";
const HEADER_IDLE_MS = 2200;
const GESTURE_THRESHOLD_PX = 8;
const TAP_TOGGLE_DELAY_MS = 160;
const CONTEXTUAL_TARGET_SELECTOR = [
  ".message",
  ".message-form",
  ".reply-preview",
  ".image-preview-container",
  ".chat-tools",
  ".chat-scrollbar",
  ".scroll-bottom-btn",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable=\"true\"]",
].join(",");

let hideTimer = 0;
let tapToggleTimer = 0;
let activeGesture = null;
let headerCollapsedBeforeKeyboard = null;
let headerKeyboardPreparing = false;
let chatHasMessages = false;

function isMobileBottomDock() {
  return Boolean(
    dom.sessionView
      && dom.sessionView.dataset.chatDock === "bottom"
      && window.matchMedia(MOBILE_QUERY).matches,
  );
}

function isLayoutTransitioning() {
  return Boolean(
    dom.sessionView?.classList.contains("chat-layout-transitioning")
      || dom.sessionView?.classList.contains("chat-dock-switching")
      || dom.sessionView?.classList.contains("chat-bottom-collapse-visual")
      || dom.sessionView?.classList.contains("chat-bottom-expand-visual"),
  );
}

function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains("bottom-chat-keyboard-open");
}

function isActiveBottomChat() {
  return Boolean(
    isMobileBottomDock()
      && dom.sessionView
      && !dom.sessionView.hidden
      && !dom.sessionView.classList.contains("chat-collapsed")
      && !isLayoutTransitioning(),
  );
}

function hasMessages() {
  return Boolean(dom.messages?.querySelector(".message"));
}

function clearHideTimer() {
  if (!hideTimer) return;
  window.clearTimeout(hideTimer);
  hideTimer = 0;
}

function clearTapToggleTimer() {
  if (!tapToggleTimer) return;
  window.clearTimeout(tapToggleTimer);
  tapToggleTimer = 0;
}

function hasPersistentActivity() {
  const activeElement = document.activeElement;
  const editingName = activeElement === dom.nameInput
    && dom.chatNameEditor?.dataset.editing === "true";
  const composingMessage = Boolean(dom.messageInput?.value.trim());

  return Boolean(
    composingMessage
      || state.chat.replyTarget
      || state.chat.menuMessage
      || state.chat.longPressStart
      || state.chat.pendingImage?.length
      || dom.messageMenu && !dom.messageMenu.hidden
      || dom.replyPreview && !dom.replyPreview.hidden
      || dom.imagePreview && !dom.imagePreview.hidden
      || editingName,
  );
}

function setHeaderCollapsed(collapsed) {
  if (!dom.sessionView) return;
  if (!isMobileBottomDock() || isLayoutTransitioning()) {
    dom.sessionView.classList.remove("chat-header-collapsed");
    return;
  }
  const forcedByKeyboard = isBottomChatKeyboardOpen() || headerKeyboardPreparing;
  if (collapsed || forcedByKeyboard) hideTooltip(true);
  dom.sessionView.classList.toggle(
    "chat-header-collapsed",
    Boolean(collapsed || forcedByKeyboard),
  );
}

function scheduleHeaderHide() {
  clearHideTimer();
  if (isBottomChatKeyboardOpen() || headerKeyboardPreparing) {
    setHeaderCollapsed(true);
    return;
  }
  if (!isActiveBottomChat()) return;
  if (!hasMessages()) {
    setHeaderCollapsed(false);
    return;
  }
  if (activeGesture || hasPersistentActivity()) return;

  hideTimer = window.setTimeout(() => {
    hideTimer = 0;
    if (!isActiveBottomChat() || activeGesture || hasPersistentActivity()) return;
    setHeaderCollapsed(true);
  }, HEADER_IDLE_MS);
}

function isContextualTarget(target) {
  return target instanceof Element && Boolean(target.closest(CONTEXTUAL_TARGET_SELECTOR));
}

function revealHeader() {
  if (isBottomChatKeyboardOpen()) {
    setHeaderCollapsed(true);
    return;
  }
  if (!isActiveBottomChat()) return;
  clearHideTimer();
  setHeaderCollapsed(false);
  scheduleHeaderHide();
}

function scheduleHeaderToggle() {
  if (isBottomChatKeyboardOpen() || !isActiveBottomChat()) return;
  clearTapToggleTimer();
  tapToggleTimer = window.setTimeout(() => {
    tapToggleTimer = 0;
    if (
      isBottomChatKeyboardOpen()
        || !isActiveBottomChat()
        || hasPersistentActivity()
    ) return;

    const shouldCollapse = !dom.sessionView.classList.contains("chat-header-collapsed");
    setHeaderCollapsed(shouldCollapse);
    if (!shouldCollapse) scheduleHeaderHide();
  }, TAP_TOGGLE_DELAY_MS);
}

function scheduleHeaderCollapseAfterMessage() {
  if (!isActiveBottomChat() || !hasMessages()) return;
  clearHideTimer();
  clearTapToggleTimer();
  window.setTimeout(() => {
    if (!isActiveBottomChat() || !hasMessages() || hasPersistentActivity()) return;
    if (isBottomChatKeyboardOpen()) headerCollapsedBeforeKeyboard = true;
    setHeaderCollapsed(true);
  }, TAP_TOGGLE_DELAY_MS);
}

function canScrollMessagesAtStart(upward) {
  if (!dom.messages || !activeGesture) return false;
  const maxScrollTop = Math.max(0, dom.messages.scrollHeight - dom.messages.clientHeight);
  if (maxScrollTop <= 1) return false;
  return upward
    ? activeGesture.initialScrollTop < maxScrollTop - 1
    : activeGesture.initialScrollTop > 1;
}

function startGesture(event) {
  if (event.isPrimary === false || !dom.chatArea?.contains(event.target)) return;

  activeGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    axis: null,
    moved: false,
    startedInMessages: event.target instanceof Element && Boolean(event.target.closest("#messages")),
    contextual: isContextualTarget(event.target),
    initialScrollTop: dom.messages?.scrollTop || 0,
    localSwipeUp: false,
  };
  clearHideTimer();
}

function updateGesture(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;

  const deltaX = event.clientX - activeGesture.startX;
  const deltaY = event.clientY - activeGesture.startY;
  if (!activeGesture.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= GESTURE_THRESHOLD_PX) {
    activeGesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    activeGesture.moved = true;
  }

  if (
    activeGesture.startedInMessages
      && activeGesture.axis === "vertical"
      && deltaY <= -GESTURE_THRESHOLD_PX
      && canScrollMessagesAtStart(true)
  ) {
    activeGesture.localSwipeUp = true;
    revealHeader();
  }
}

function finishGesture(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;

  const gesture = activeGesture;
  const isTap = !gesture.moved;
  const isContextFreeTap = isTap && !gesture.contextual;
  activeGesture = null;

  // Solo el scroll que empieza dentro de #messages puede revelar el header.
  // Un arrastre de la pagina conserva el estado visible/oculto que ya tenia.
  if (gesture.localSwipeUp || isContextFreeTap) {
    if (isContextFreeTap && !gesture.localSwipeUp) scheduleHeaderToggle();
    else revealHeader();
    return;
  }
  scheduleHeaderHide();
}

function handleWheel(event) {
  if (!isActiveBottomChat() || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

  const maxScrollTop = Math.max(0, dom.messages.scrollHeight - dom.messages.clientHeight);
  if (maxScrollTop <= 1) return;

  const canScroll = event.deltaY < 0
    ? dom.messages.scrollTop > 1
    : dom.messages.scrollTop < maxScrollTop - 1;
  if (!canScroll) return;

  if (event.deltaY < 0) revealHeader();
  else scheduleHeaderHide();
}

function syncHeaderMode() {
  if ((isBottomChatKeyboardOpen() || headerKeyboardPreparing) && isActiveBottomChat()) {
    if (headerCollapsedBeforeKeyboard === null) {
      headerCollapsedBeforeKeyboard = dom.sessionView.classList.contains("chat-header-collapsed");
    }
    clearHideTimer();
    setHeaderCollapsed(true);
    return;
  }

  if (!isBottomChatKeyboardOpen() && !headerKeyboardPreparing && headerCollapsedBeforeKeyboard !== null) {
    const shouldRestoreCollapsed = headerCollapsedBeforeKeyboard;
    headerCollapsedBeforeKeyboard = null;
    if (isActiveBottomChat()) {
      setHeaderCollapsed(shouldRestoreCollapsed);
      if (!shouldRestoreCollapsed) scheduleHeaderHide();
      return;
    }
  }

  if (!isActiveBottomChat()) {
    clearHideTimer();
    setHeaderCollapsed(false);
    return;
  }
  scheduleHeaderHide();
}

export function wireMobileBottomChatHeader() {
  if (!dom.sessionView || !dom.chatArea || !dom.messages) return;

  document.addEventListener("pointerdown", startGesture, { capture: true, passive: true });
  document.addEventListener("pointermove", updateGesture, { capture: true, passive: true });
  document.addEventListener("pointerup", finishGesture, { capture: true, passive: true });
  document.addEventListener("pointercancel", finishGesture, { capture: true, passive: true });
  dom.messages.addEventListener("wheel", handleWheel, { passive: true });

  dom.chatArea.addEventListener("focusin", (event) => {
    if (event.target === dom.messageInput && isActiveBottomChat()) {
      if (headerCollapsedBeforeKeyboard === null) {
        headerCollapsedBeforeKeyboard = dom.sessionView.classList.contains("chat-header-collapsed");
      }
      headerKeyboardPreparing = true;
      clearHideTimer();
      setHeaderCollapsed(true);
    }
    scheduleHeaderHide();
  }, { passive: true });
  dom.chatArea.addEventListener("focusout", (event) => {
    if (event.target === dom.messageInput) headerKeyboardPreparing = false;
    syncHeaderMode();
    scheduleHeaderHide();
  }, { passive: true });
  dom.messageInput?.addEventListener("input", scheduleHeaderHide, { passive: true });
  chatHasMessages = hasMessages();

  const activityObserver = new MutationObserver(() => {
    const nextHasMessages = hasMessages();
    if (!chatHasMessages && nextHasMessages) scheduleHeaderCollapseAfterMessage();
    chatHasMessages = nextHasMessages;
    scheduleHeaderHide();
  });
  activityObserver.observe(dom.messages, { childList: true });
  [dom.replyPreview, dom.imagePreview, dom.messageMenu, dom.chatNameEditor].forEach((element) => {
    if (!element) return;
    activityObserver.observe(element, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  window.addEventListener("chat-layout-settled", syncHeaderMode, { passive: true });
  window.addEventListener("resize", syncHeaderMode, { passive: true });
  window.visualViewport?.addEventListener("resize", syncHeaderMode, { passive: true });
  const viewportStateObserver = new MutationObserver(syncHeaderMode);
  viewportStateObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncHeaderMode();
}

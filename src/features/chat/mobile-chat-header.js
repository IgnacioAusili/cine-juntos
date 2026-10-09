// Controla la cabecera del chat en pantallas tactiles.
import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js?v=20261008";
import { hideTooltip } from "../icons-tooltips.js?v=20261008";

const MOBILE_QUERY = "(hover: none) and (pointer: coarse)";
const HEADER_IDLE_MS = 2200;
const GESTURE_THRESHOLD_PX = 8;
const TAP_TOGGLE_DELAY_MS = 160;
const CONTEXTUAL_TARGET_SELECTOR = [
  ".message",
  ".message-form",
  ".reply-preview",
  ".image-preview-container",
  ".chat-scrollbar",
  ".scroll-bottom-btn",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable=\"true\"]",
].join(",");
const MESSAGE_INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable=\"true\"]",
  "[role=\"button\"]",
].join(",");

let hideTimer = 0;
let tapToggleTimer = 0;
let activeGesture = null;
let headerCollapsedBeforeKeyboard = null;
let headerKeyboardPreparing = false;
let chatHasMessages = false;
let dockHandleSwitchActive = false;
let bottomDockHandleRevealPending = false;

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

function syncCollapseHandleAfterDockSwitch() {
  const sessionView = dom.sessionView;
  if (!sessionView) {
    dockHandleSwitchActive = false;
    bottomDockHandleRevealPending = false;
    return;
  }

  const handleSwitching = sessionView.classList.contains("chat-dock-handle-switching");
  if (handleSwitching) dockHandleSwitchActive = true;

  const isBottomDock = sessionView.dataset.chatDock === "bottom";
  if (isBottomDock && sessionView.classList.contains("chat-bottom-mobile-expand-visual")) {
    bottomDockHandleRevealPending = true;
  }
  if (!isBottomDock) bottomDockHandleRevealPending = false;

  const transitionActive = Boolean(
    isLayoutTransitioning()
      || sessionView.classList.contains("chat-dock-switching")
      || sessionView.classList.contains("chat-bottom-mobile-expand-visual")
      || sessionView.classList.contains("chat-bottom-mobile-curtain-active"),
  );
  const shouldRevealBottomHandle = isBottomDock && bottomDockHandleRevealPending && !transitionActive;
  const shouldResyncDockHandle = dockHandleSwitchActive && !handleSwitching && !transitionActive;
  if (!shouldRevealBottomHandle && !shouldResyncDockHandle) return;

  window.requestAnimationFrame(() => {
    if (sessionView !== dom.sessionView) return;
    const transitionStillActive = Boolean(
      isLayoutTransitioning()
        || sessionView.classList.contains("chat-dock-switching")
        || sessionView.classList.contains("chat-bottom-mobile-expand-visual")
        || sessionView.classList.contains("chat-bottom-mobile-curtain-active"),
    );
    if (transitionStillActive) return;

    if (sessionView.dataset.chatDock === "bottom" && bottomDockHandleRevealPending) {
      sessionView.classList.remove("chat-dock-handle-switching");
      bottomDockHandleRevealPending = false;
    } else if (sessionView.classList.contains("chat-dock-handle-switching")) {
      return;
    }

    dockHandleSwitchActive = false;
    // El evento existente vuelve a medir el handle cuando ya terminó la
    // transición de ancho y el dock lateral puede calcular su ancla al header.
    window.dispatchEvent(new Event("chat-layout-settled"));
  });
}

function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains("bottom-chat-keyboard-open");
}

function isChatKeyboardOpen() {
  return isBottomChatKeyboardOpen()
    || document.documentElement.classList.contains("right-chat-keyboard-open");
}

function isNameEditorActive() {
  return dom.chatNameField?.dataset.editing === "true"
    && document.activeElement === dom.nameInput;
}

function isHeaderForcedByKeyboard() {
  return (isChatKeyboardOpen() && !isNameEditorActive()) || headerKeyboardPreparing;
}

function isActiveChatDock() {
  return Boolean(
    isMobileChatHeaderDock()
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
  if (!isMobileChatHeaderDock() || isLayoutTransitioning()) {
    dom.sessionView.classList.remove("chat-header-collapsed");
    return;
  }
  const keepVisibleWithoutMessages = !hasMessages();
  const shouldCollapse = !isNameEditorActive()
    && (isHeaderForcedByKeyboard() || (Boolean(collapsed) && !keepVisibleWithoutMessages));
  if (shouldCollapse) hideTooltip(true);
  dom.sessionView.classList.toggle(
    "chat-header-collapsed",
    shouldCollapse,
  );
}

function isMobileLandscapeRightDock() {
  return Boolean(
    dom.sessionView
      && dom.sessionView.dataset.chatDock === "right"
      && document.documentElement.classList.contains("viewport-landscape")
      && window.matchMedia("(max-width: 980px) and (orientation: landscape)").matches,
  );
}

function isMobileChatHeaderDock() {
  return isMobileBottomDock() || isMobileLandscapeRightDock();
}

function scheduleHeaderHide() {
  clearHideTimer();
  if (isHeaderForcedByKeyboard()) {
    setHeaderCollapsed(true);
    return;
  }
  if (!isActiveChatDock()) return;
  if (!hasMessages()) {
    setHeaderCollapsed(false);
    return;
  }
  if (activeGesture || hasPersistentActivity()) return;

  hideTimer = window.setTimeout(() => {
    hideTimer = 0;
    if (!isActiveChatDock() || activeGesture || hasPersistentActivity()) return;
    setHeaderCollapsed(true);
  }, HEADER_IDLE_MS);
}

function isContextualTarget(target) {
  if (!(target instanceof Element)) return false;
  const chatTools = target.closest(".chat-tools");
  if (chatTools) return Boolean(target.closest(MESSAGE_INTERACTIVE_SELECTOR));
  return Boolean(target.closest(CONTEXTUAL_TARGET_SELECTOR));
}

function isMessageSurfaceTap(target) {
  if (!(target instanceof Element) || !target.closest("#messages")) return false;
  return !target.closest(MESSAGE_INTERACTIVE_SELECTOR);
}

function isSystemMessageTarget(target) {
  return target instanceof Element && Boolean(target.closest("#messages .message.system"));
}

function revealHeader() {
  if (isChatKeyboardOpen()) {
    setHeaderCollapsed(true);
    return;
  }
  if (!isActiveChatDock()) return;
  clearHideTimer();
  setHeaderCollapsed(false);
  scheduleHeaderHide();
}

function scheduleHeaderToggle() {
  if (isChatKeyboardOpen() || !isActiveChatDock()) return;
  if (!hasMessages()) {
    setHeaderCollapsed(false);
    return;
  }
  clearTapToggleTimer();
  tapToggleTimer = window.setTimeout(() => {
    tapToggleTimer = 0;
    if (isChatKeyboardOpen() || !isActiveChatDock()) return;

    const isCollapsed = dom.sessionView.classList.contains("chat-header-collapsed");
    // La actividad persistente impide volver a ocultar la cabecera, pero no
    // debe impedir que un toque sobre el chat la revele si ya estaba plegada.
    if (!isCollapsed && hasPersistentActivity()) return;

    const shouldCollapse = !isCollapsed;
    setHeaderCollapsed(shouldCollapse);
    if (!shouldCollapse) scheduleHeaderHide();
  }, TAP_TOGGLE_DELAY_MS);
}

function scheduleHeaderCollapseAfterMessage() {
  if (!isActiveChatDock() || !hasMessages()) return;
  clearHideTimer();
  clearTapToggleTimer();
  window.setTimeout(() => {
    if (!isActiveChatDock() || !hasMessages() || hasPersistentActivity()) return;
    if (isChatKeyboardOpen()) headerCollapsedBeforeKeyboard = true;
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
    startedInSystemMessage: isSystemMessageTarget(event.target),
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
  const isMessagesSurfaceTap = isTap && isMessageSurfaceTap(event.target);
  activeGesture = null;

  // Los mensajes de sistema tienen su propia interacción (expandir el grupo,
  // abrir el menú o responder). Un toque allí no debe reutilizar el gesto
  // global que alterna la visibilidad del header del chat.
  if (isTap && gesture.startedInSystemMessage) return;

  // Solo el scroll que empieza dentro de #messages puede revelar el header.
  // Un arrastre de la pagina conserva el estado visible/oculto que ya tenia.
  if (gesture.localSwipeUp || isContextFreeTap || isMessagesSurfaceTap) {
    if ((isContextFreeTap || isMessagesSurfaceTap) && !gesture.localSwipeUp) {
      scheduleHeaderToggle();
    }
    else revealHeader();
    return;
  }
  scheduleHeaderHide();
}

function handleWheel(event) {
  if (!isActiveChatDock() || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

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
  if (isHeaderForcedByKeyboard() && isActiveChatDock()) {
    if (headerCollapsedBeforeKeyboard === null) {
      headerCollapsedBeforeKeyboard = dom.sessionView.classList.contains("chat-header-collapsed");
    }
    clearHideTimer();
    setHeaderCollapsed(true);
    return;
  }

  if (!isHeaderForcedByKeyboard() && headerCollapsedBeforeKeyboard !== null) {
    const shouldRestoreCollapsed = headerCollapsedBeforeKeyboard;
    headerCollapsedBeforeKeyboard = null;
    if (isActiveChatDock()) {
      setHeaderCollapsed(shouldRestoreCollapsed);
      if (!shouldRestoreCollapsed) scheduleHeaderHide();
      return;
    }
  }

  if (!isActiveChatDock()) {
    clearHideTimer();
    setHeaderCollapsed(false);
    return;
  }
  scheduleHeaderHide();
}

export function wireMobileBottomChatHeader() {
  if (!dom.sessionView || !dom.chatArea || !dom.messages) return;

  const dockSwitchObserver = new MutationObserver(syncCollapseHandleAfterDockSwitch);
  dockSwitchObserver.observe(dom.sessionView, {
    attributes: true,
    attributeFilter: ["class"],
  });

  document.addEventListener("pointerdown", startGesture, { capture: true, passive: true });
  document.addEventListener("pointermove", updateGesture, { capture: true, passive: true });
  document.addEventListener("pointerup", finishGesture, { capture: true, passive: true });
  document.addEventListener("pointercancel", finishGesture, { capture: true, passive: true });
  dom.messages.addEventListener("wheel", handleWheel, { passive: true });

  dom.chatArea.addEventListener("focusin", (event) => {
    if (event.target === dom.messageInput && isActiveChatDock()) {
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

// Controla la cabecera del chat inferior en pantallas tactiles.
import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
const MOBILE_QUERY = "(max-width: 680px)";
const HEADER_IDLE_MS = 2200;
const GESTURE_THRESHOLD_PX = 8;
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
let activeGesture = null;
let knownHeaderCollapsed = false;
function isMobileBottomDock() {
  return Boolean(
    dom.sessionView
      && dom.sessionView.dataset.chatDock === "bottom"
      && window.matchMedia(MOBILE_QUERY).matches,
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
function hasPersistentActivity() {
  const activeElement = document.activeElement;
  const editingName = activeElement === dom.nameInput
    && dom.chatNameEditor?.dataset.editing === "true";
  const composingMessage = activeElement === dom.messageInput
    && Boolean(dom.messageInput.value.trim());
  return Boolean(
    state.chat.replyTarget
      || state.chat.menuMessage
      || state.chat.longPressStart
      || !dom.messageMenu?.hidden
      || !dom.replyPreview?.hidden
      || state.chat.pendingImage?.length
      || editingName
      || composingMessage,
  );
}
function setHeaderCollapsed(collapsed) {
  if (!dom.sessionView) return;
  if (!isMobileBottomDock()) {
    dom.sessionView.classList.remove("chat-header-collapsed");
    knownHeaderCollapsed = false;
    return;
  }
  dom.sessionView.classList.toggle("chat-header-collapsed", collapsed);
  knownHeaderCollapsed = collapsed;
}
function scheduleHeaderHide() {
  clearHideTimer();
  if (!isMobileBottomDock() || !hasMessages() || activeGesture || hasPersistentActivity()) return;

  hideTimer = window.setTimeout(() => {
    hideTimer = 0;
    if (activeGesture || hasPersistentActivity()) return;
    setHeaderCollapsed(true);
  }, HEADER_IDLE_MS);
}
function isContextualTarget(target) {
  return target instanceof Element && Boolean(target.closest(CONTEXTUAL_TARGET_SELECTOR));
}
function isVisibleInViewport(element) {
  const rect = element?.getBoundingClientRect();
  return Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight);
}
function revealHeader() {
  if (!isMobileBottomDock() || !isVisibleInViewport(dom.chatArea)) return;
  clearHideTimer();
  setHeaderCollapsed(false);
  scheduleHeaderHide();
}
function startGesture(event) {
  if (event.isPrimary === false || activeGesture) return;
  activeGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    axis: null,
    moved: false,
    target: event.target,
    startedInChat: Boolean(dom.chatArea?.contains(event.target)),
    startedInMessages: Boolean(event.target instanceof Element && event.target.closest("#messages")),
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
    activeGesture.startedInChat
    && activeGesture.axis === "vertical"
    && deltaY <= -GESTURE_THRESHOLD_PX
  ) {
    // El navegador puede cancelar el puntero cuando empieza el scroll nativo;
    // revelar durante el gesto local evita perder este caso.
    revealHeader();
  }
}
function finishGesture(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;

  const gesture = activeGesture;
  const deltaY = event.clientY - gesture.startY;
  const swipeUp = gesture.axis === "vertical" && deltaY <= -GESTURE_THRESHOLD_PX;
  const isTap = !gesture.moved;
  const isContextFreeTap = isTap && gesture.startedInChat && !isContextualTarget(gesture.target);

  activeGesture = null;

  // Un arrastre hacia arriba lleva al chat inferior. Un arrastre hacia abajo,
  // usado para volver arriba en la página, no modifica el estado actual.
  if (swipeUp || isContextFreeTap) revealHeader();
  else scheduleHeaderHide();
}
function cancelGesture(event) {
  // El scroll nativo suele cancelar el puntero. Sus coordenadas todavía
  // permiten conservar la dirección del gesto y aplicar la misma regla que
  // en pointerup.
  finishGesture(event);
}
function handleWheel(event) {
  if (!isMobileBottomDock() || !event.deltaY) return;
  const maxScrollTop = dom.messages.scrollHeight - dom.messages.clientHeight;
  if (maxScrollTop <= 0) return;
  const canScroll = event.deltaY < 0
    ? dom.messages.scrollTop > 0
    : dom.messages.scrollTop < maxScrollTop;
  if (!canScroll) return;
  if (event.deltaY < 0) revealHeader();
  else scheduleHeaderHide();
}
export function wireMobileBottomChatHeader() {
  if (!dom.sessionView || !dom.chatArea || !dom.messages) return;

  document.addEventListener("pointerdown", startGesture, { capture: true, passive: true });
  document.addEventListener("pointermove", updateGesture, { capture: true, passive: true });
  document.addEventListener("pointerup", finishGesture, { capture: true, passive: true });
  document.addEventListener("pointercancel", cancelGesture, { capture: true, passive: true });
  dom.messages.addEventListener("wheel", handleWheel, { passive: true });
  dom.chatArea.addEventListener("focusin", () => {
    clearHideTimer();
    scheduleHeaderHide();
  }, { passive: true });
  dom.chatArea.addEventListener("focusout", scheduleHeaderHide, { passive: true });
  dom.messageInput?.addEventListener("input", scheduleHeaderHide, { passive: true });

  const activityObserver = new MutationObserver(() => scheduleHeaderHide());
  activityObserver.observe(dom.messages, { childList: true, subtree: true });
  [dom.replyPreview, dom.imagePreview, dom.messageMenu].forEach((element) => {
    if (!element) return;
    activityObserver.observe(element, { attributes: true, childList: true, subtree: true });
  });

  const dockObserver = new MutationObserver((records) => {
    const dockChanged = records.some((record) => record.attributeName === "data-chat-dock");
    const classChangedExternally = records.some(
      (record) => record.attributeName === "class"
        && dom.sessionView.classList.contains("chat-header-collapsed") !== knownHeaderCollapsed,
    );
    if (!isMobileBottomDock()) {
      clearHideTimer();
      setHeaderCollapsed(false);
      return;
    }
    if (classChangedExternally) {
      knownHeaderCollapsed = dom.sessionView.classList.contains("chat-header-collapsed");
      if (knownHeaderCollapsed) clearHideTimer();
      else scheduleHeaderHide();
    }
    if (!dockChanged) return;
    setHeaderCollapsed(false);
    scheduleHeaderHide();
  });
  dockObserver.observe(dom.sessionView, { attributes: true, attributeFilter: ["data-chat-dock", "class"] });

  window.addEventListener("resize", () => {
    if (!isMobileBottomDock()) {
      clearHideTimer();
      setHeaderCollapsed(false);
      return;
    }
    setHeaderCollapsed(false);
    scheduleHeaderHide();
  }, { passive: true });

  setHeaderCollapsed(false);
  scheduleHeaderHide();
}

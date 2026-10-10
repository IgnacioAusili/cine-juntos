import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const GESTURE_THRESHOLD_PX = 8;

export function wireMobileChatHeaderGestures({
  clearHideTimer,
  isSystemMessageTarget,
  isContextualTarget,
  isMessageSurfaceTap,
  revealHeader,
  scheduleHeaderToggle,
  scheduleHeaderHide,
}) {
  let activeGesture = null;

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

  document.addEventListener("pointerdown", startGesture, { capture: true, passive: true });
  document.addEventListener("pointermove", updateGesture, { capture: true, passive: true });
  document.addEventListener("pointerup", finishGesture, { capture: true, passive: true });
  document.addEventListener("pointercancel", finishGesture, { capture: true, passive: true });
}

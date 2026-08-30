const TOUCH_POINTER_TYPES = new Set(["touch", "pen"]);
export const TOUCH_LONG_PRESS_DELAY_MS = 520;
const TOUCH_MOVE_TOLERANCE_PX = 10;

export function isTouchPointer(event) {
  return TOUCH_POINTER_TYPES.has(event?.pointerType);
}

/**
 * Emula un estado hover durante una pulsación larga en superficies táctiles.
 * El estado siempre se limpia al soltar, cancelar, mover demasiado el puntero
 * o perder la captura, para no dejar estilos pegados en móviles.
 */
export function wireTouchHover(
  target,
  {
    activeClass = "is-touch-hover",
    delay = TOUCH_LONG_PRESS_DELAY_MS,
    cancelActiveOnMove = true,
    onActivate,
    onDeactivate,
    eventDocument = target?.ownerDocument || document,
  } = {},
) {
  if (!target) return () => {};

  let pointerId = null;
  let startPoint = null;
  let timer = null;
  let active = false;

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  const deactivate = (event) => {
    clearTimer();
    pointerId = null;
    startPoint = null;
    if (!active) return;
    active = false;
    target.classList.remove(activeClass);
    onDeactivate?.(event);
  };

  const activate = (event) => {
    if (pointerId === null || active) return;
    active = true;
    target.classList.add(activeClass);
    onActivate?.(event);
  };

  const handlePointerDown = (event) => {
    if (!isTouchPointer(event) || (event.button && event.button !== 0)) return;

    deactivate();
    pointerId = event.pointerId;
    startPoint = { x: event.clientX, y: event.clientY };
    timer = window.setTimeout(() => {
      if (pointerId === event.pointerId) activate(event);
    }, delay);
  };

  const handlePointerMove = (event) => {
    if (!isTouchPointer(event) || pointerId !== event.pointerId || !startPoint) return;
    const movedX = event.clientX - startPoint.x;
    const movedY = event.clientY - startPoint.y;
    if (
      Math.hypot(movedX, movedY) > TOUCH_MOVE_TOLERANCE_PX
      && (!active || cancelActiveOnMove)
    ) deactivate(event);
  };

  const handlePointerEnd = (event) => {
    if (!isTouchPointer(event) || pointerId !== event.pointerId) return;
    deactivate(event);
  };

  target.addEventListener("pointerdown", handlePointerDown);
  eventDocument.addEventListener("pointermove", handlePointerMove, { passive: true });
  eventDocument.addEventListener("pointerup", handlePointerEnd, { passive: true });
  eventDocument.addEventListener("pointercancel", handlePointerEnd, { passive: true });
  eventDocument.addEventListener("lostpointercapture", handlePointerEnd, { passive: true });

  return () => {
    deactivate();
    target.removeEventListener("pointerdown", handlePointerDown);
    eventDocument.removeEventListener("pointermove", handlePointerMove);
    eventDocument.removeEventListener("pointerup", handlePointerEnd);
    eventDocument.removeEventListener("pointercancel", handlePointerEnd);
    eventDocument.removeEventListener("lostpointercapture", handlePointerEnd);
  };
}

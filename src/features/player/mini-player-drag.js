const DRAG_THRESHOLD_PX = 4;
const VIEWPORT_MARGIN_PX = 12;

export function wireMiniPlayerDrag(surface) {
  let dragState = null;
  let suppressClick = false;

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (event.target.closest?.("button, input, select, textarea, a, [contenteditable='true']")) return;

    const rect = surface.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
    surface.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

    dragState.moved = true;
    suppressClick = true;
    surface.classList.add("is-dragging");
    event.preventDefault();
    setSurfacePosition(surface, dragState.startLeft + deltaX, dragState.startTop + deltaY);
  };

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (surface.hasPointerCapture?.(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    surface.classList.remove("is-dragging");
    dragState = null;
  };

  const onClick = (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  };

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", finishDrag);
  surface.addEventListener("pointercancel", finishDrag);
  surface.addEventListener("click", onClick, true);

  return () => {
    surface.removeEventListener("pointerdown", onPointerDown);
    surface.removeEventListener("pointermove", onPointerMove);
    surface.removeEventListener("pointerup", finishDrag);
    surface.removeEventListener("pointercancel", finishDrag);
    surface.removeEventListener("click", onClick, true);
  };
}

export function clampMiniPlayerPosition(surface) {
  if (!surface?.style.left || !surface.style.top) return;
  const rect = surface.getBoundingClientRect();
  setSurfacePosition(surface, rect.left, rect.top);
}

function setSurfacePosition(surface, left, top) {
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - surface.offsetWidth - VIEWPORT_MARGIN_PX);
  const maxTop = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - surface.offsetHeight - VIEWPORT_MARGIN_PX);
  surface.style.left = `${Math.round(Math.min(maxLeft, Math.max(VIEWPORT_MARGIN_PX, left)))}px`;
  surface.style.top = `${Math.round(Math.min(maxTop, Math.max(VIEWPORT_MARGIN_PX, top)))}px`;
  surface.style.right = "auto";
  surface.style.bottom = "auto";
}

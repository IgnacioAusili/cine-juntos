export function createImageLightboxPanController({ getLightbox, getImage, getScale }) {
  let panX = 0;
  let panY = 0;
  let activePointerId = null;
  let panStart = null;

  function getPanLimits() {
    const lightbox = getLightbox();
    const image = getImage();
    const viewport = lightbox?.querySelector(".image-lightbox-viewport");
    if (!viewport || !image) return { x: 0, y: 0 };

    const viewportStyle = getComputedStyle(viewport);
    const availableWidth = viewport.clientWidth
      - parseFloat(viewportStyle.paddingLeft)
      - parseFloat(viewportStyle.paddingRight);
    const availableHeight = viewport.clientHeight
      - parseFloat(viewportStyle.paddingTop)
      - parseFloat(viewportStyle.paddingBottom);

    return {
      x: Math.abs(image.offsetWidth * getScale() - availableWidth) / 2,
      y: Math.abs(image.offsetHeight * getScale() - availableHeight) / 2,
    };
  }

  function setPan(nextX, nextY) {
    const limits = getPanLimits();
    panX = Math.min(limits.x, Math.max(-limits.x, nextX));
    panY = Math.min(limits.y, Math.max(-limits.y, nextY));
    const image = getImage();
    image?.style.setProperty("--image-lightbox-offset-x", `${panX}px`);
    image?.style.setProperty("--image-lightbox-offset-y", `${panY}px`);
  }

  function startPan(event) {
    if (!getLightbox()?.open || (event.pointerType === "mouse" && event.button !== 0)) return;

    activePointerId = event.pointerId;
    panStart = {
      x: panX,
      y: panY,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    try {
      getImage()?.setPointerCapture?.(event.pointerId);
    } catch {
      // Algunos eventos sintéticos no tienen un puntero capturable.
    }
    getImage()?.classList.add("is-dragging");
    event.preventDefault();
    event.stopPropagation();
  }

  function movePan(event) {
    if (event.pointerId !== activePointerId || !panStart) return;

    setPan(
      panStart.x + event.clientX - panStart.pointerX,
      panStart.y + event.clientY - panStart.pointerY,
    );
    event.preventDefault();
    event.stopPropagation();
  }

  function endPan(event) {
    if (event.pointerId !== activePointerId) return;

    try {
      getImage()?.releasePointerCapture?.(event.pointerId);
    } catch {
      // El puntero puede haber sido cancelado antes de liberar la captura.
    }
    getImage()?.classList.remove("is-dragging");
    activePointerId = null;
    panStart = null;
    event.stopPropagation();
  }

  function bind() {
    const image = getImage();
    image?.addEventListener("pointerdown", startPan);
    image?.addEventListener("pointermove", movePan);
    image?.addEventListener("pointerup", endPan);
    image?.addEventListener("pointercancel", endPan);
  }

  return {
    bind,
    reset: () => setPan(0, 0),
    update: () => setPan(panX, panY),
  };
}

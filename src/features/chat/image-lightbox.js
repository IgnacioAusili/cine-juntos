const LIGHTBOX_ID = "imageLightbox";
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

let lightbox = null;
let lightboxImage = null;
let zoomLabel = null;
let scale = 1;
let panX = 0;
let panY = 0;
let activePointerId = null;
let panStart = null;
let lastTrigger = null;

function ensureLightbox() {
  if (lightbox) return lightbox;

  lightbox = document.createElement("dialog");
  lightbox.id = LIGHTBOX_ID;
  lightbox.className = "image-lightbox";
  lightbox.setAttribute("aria-label", "Visor de imagen");
  lightbox.innerHTML = `
    <div class="image-lightbox-surface">
      <div class="image-lightbox-toolbar" aria-label="Controles de zoom">
        <div class="image-lightbox-zoom-controls">
          <button class="image-lightbox-button" type="button" data-lightbox-action="zoom-out" aria-label="Alejar imagen"><span class="image-lightbox-icon" data-lucide="minus" aria-hidden="true"></span></button>
          <span class="image-lightbox-zoom-label" aria-live="polite">100%</span>
          <button class="image-lightbox-button" type="button" data-lightbox-action="zoom-in" aria-label="Acercar imagen"><span class="image-lightbox-icon" data-lucide="plus" aria-hidden="true"></span></button>
        </div>
      </div>
      <button class="image-lightbox-button image-lightbox-close" type="button" data-lightbox-action="close" aria-label="Cerrar imagen"><span class="image-lightbox-icon" data-lucide="x" aria-hidden="true"></span></button>
      <div class="image-lightbox-viewport" data-lightbox-action="dismiss">
        <img class="image-lightbox-image" alt="" draggable="false" />
      </div>
    </div>
  `;
  document.body.append(lightbox);
  window.lucide?.createIcons();
  lightboxImage = lightbox.querySelector(".image-lightbox-image");
  zoomLabel = lightbox.querySelector(".image-lightbox-zoom-label");

  lightbox.addEventListener("click", (event) => {
    event.stopPropagation();

    if (event.target.closest(".image-lightbox-image")) {
      event.preventDefault();
      return;
    }

    const action = event.target.closest("[data-lightbox-action]")?.dataset.lightboxAction;
    if (event.target.closest("button")) {
      event.preventDefault();
    }
    if (action === "close" || action === "dismiss") {
      closeLightbox();
    } else if (action === "zoom-in") {
      changeScale(SCALE_STEP);
    } else if (action === "zoom-out") {
      changeScale(-SCALE_STEP);
    }
  });
  lightbox.addEventListener("cancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeLightbox();
  });
  lightbox.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.target.closest(".image-lightbox-viewport")) return;
    changeScale(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
  }, { passive: false });
  lightboxImage.addEventListener("pointerdown", startPan);
  lightboxImage.addEventListener("pointermove", movePan);
  lightboxImage.addEventListener("pointerup", endPan);
  lightboxImage.addEventListener("pointercancel", endPan);
  document.addEventListener("keydown", handleKeydown);
  return lightbox;
}

function getInitialScale(modal) {
  if (!lightboxImage?.naturalWidth || !lightboxImage?.naturalHeight) return 1;

  const availableWidth = Math.max(0, modal.clientWidth - 48);
  const availableHeight = Math.max(0, modal.clientHeight - 96);
  const imageExceedsViewport = lightboxImage.naturalWidth > availableWidth
    || lightboxImage.naturalHeight > availableHeight;

  return imageExceedsViewport ? MIN_SCALE : 1;
}

function applyInitialScale(modal) {
  resetScale(getInitialScale(modal));
}

function getPanLimits() {
  const viewport = lightbox?.querySelector(".image-lightbox-viewport");
  if (!viewport || !lightboxImage) return { x: 0, y: 0 };

  const viewportStyle = getComputedStyle(viewport);
  const availableWidth = viewport.clientWidth
    - parseFloat(viewportStyle.paddingLeft)
    - parseFloat(viewportStyle.paddingRight);
  const availableHeight = viewport.clientHeight
    - parseFloat(viewportStyle.paddingTop)
    - parseFloat(viewportStyle.paddingBottom);

  return {
    x: Math.max(0, (lightboxImage.offsetWidth * scale - availableWidth) / 2),
    y: Math.max(0, (lightboxImage.offsetHeight * scale - availableHeight) / 2),
  };
}

function setPan(nextX, nextY) {
  const limits = getPanLimits();
  panX = Math.min(limits.x, Math.max(-limits.x, nextX));
  panY = Math.min(limits.y, Math.max(-limits.y, nextY));
  lightboxImage?.style.setProperty("--image-lightbox-offset-x", `${panX}px`);
  lightboxImage?.style.setProperty("--image-lightbox-offset-y", `${panY}px`);
}

function startPan(event) {
  if (!lightbox?.open || (event.pointerType === "mouse" && event.button !== 0)) return;

  activePointerId = event.pointerId;
  panStart = {
    x: panX,
    y: panY,
    pointerX: event.clientX,
    pointerY: event.clientY,
  };
  try {
  lightboxImage?.setPointerCapture?.(event.pointerId);
  } catch {
    // Algunos eventos sintéticos no tienen un puntero capturable.
  }
  lightboxImage?.classList.add("is-dragging");
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
    lightboxImage?.releasePointerCapture?.(event.pointerId);
  } catch {
    // El puntero puede haber sido cancelado antes de liberar la captura.
  }
  lightboxImage?.classList.remove("is-dragging");
  activePointerId = null;
  panStart = null;
  event.stopPropagation();
}

function changeScale(delta) {
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  setPan(panX, panY);
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function resetScale(nextScale = 1) {
  scale = nextScale;
  setPan(0, 0);
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function openLightbox(image) {
  const modal = ensureLightbox();
  lastTrigger = image.closest(".message-media-link") || image;
  resetScale();
  lightboxImage.src = image.currentSrc || image.src;
  lightboxImage.alt = image.alt || "Imagen ampliada";
  lightboxImage.addEventListener("load", () => applyInitialScale(modal), { once: true });
  if (!modal.open) modal.showModal();
  document.documentElement.classList.add("image-lightbox-open");
  document.body.classList.add("image-lightbox-open");
  if (lightboxImage.complete) applyInitialScale(modal);
  modal.querySelector("[data-lightbox-action='close']")?.focus();
}

function closeLightbox() {
  if (!lightbox?.open) return;
  lightbox.close();
  document.documentElement.classList.remove("image-lightbox-open");
  document.body.classList.remove("image-lightbox-open");
  lightboxImage?.removeAttribute("src");
  lastTrigger?.focus?.();
  lastTrigger = null;
  resetScale();
}

function handleKeydown(event) {
  if (!lightbox?.open) return;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    changeScale(SCALE_STEP);
  } else if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    changeScale(-SCALE_STEP);
  } else if (event.key === "0") {
    event.preventDefault();
    resetScale();
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest(".message-media-link");
  const image = link?.querySelector(":scope > .message-media");
  if (!image) return;
  event.preventDefault();
  event.stopPropagation();
  openLightbox(image);
}, true);

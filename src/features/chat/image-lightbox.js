import { createImageLightboxPanController } from "./image-lightbox-pan.js?v=20261010-file-size-refactor-02";

const LIGHTBOX_ID = "imageLightbox";
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

let lightbox = null;
let lightboxImage = null;
let zoomLabel = null;
let scale = 1;
let initialScale = 1;
let lastTrigger = null;
let scrollPositionsBeforeLightbox = null;
const panController = createImageLightboxPanController({
  getLightbox: () => lightbox,
  getImage: () => lightboxImage,
  getScale: () => scale,
});

function captureScrollPositions(target) {
  const positions = [];
  const pageScroller = document.scrollingElement;
  if (pageScroller) {
    positions.push({
      element: pageScroller,
      left: window.scrollX || pageScroller.scrollLeft || 0,
      top: window.scrollY || pageScroller.scrollTop || 0,
    });
  }

  for (let element = target?.parentElement; element; element = element.parentElement) {
    const isPageScroller = element === pageScroller;
    const isBody = element === document.body;
    const canScroll = element.scrollHeight > element.clientHeight
      || element.scrollWidth > element.clientWidth;
    // body puede reflejar el scroll del viewport con un scrollTop distinto
    // (normalmente 0). Guardarlo aparte del scrollingElement y restaurarlo
    // después puede devolver toda la página al inicio.
    if (!isPageScroller && !isBody && canScroll) {
      positions.push({ element, left: element.scrollLeft, top: element.scrollTop });
    }
    if (element === document.body) break;
  }

  return positions;
}

function restoreScrollPositions(positions) {
  if (!positions?.length) return;

  const restore = () => {
    for (const { element, left, top } of positions) {
      element.scrollLeft = left;
      element.scrollTop = top;
    }
  };

  restore();
  window.requestAnimationFrame(restore);
}

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
          <button class="image-lightbox-button image-lightbox-zoom-label" type="button" data-lightbox-action="reset-zoom" aria-live="polite">100%</button>
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
    } else if (action === "reset-zoom") {
      resetScale(initialScale);
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
  panController.bind();
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
  initialScale = getInitialScale(modal);
  resetScale(initialScale);
}

function changeScale(delta) {
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  panController.update();
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function resetScale(nextScale = 1) {
  scale = nextScale;
  panController.reset();
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function openLightbox(image) {
  const modal = ensureLightbox();
  lastTrigger = image.closest(".message-media-link") || image;
  scrollPositionsBeforeLightbox = captureScrollPositions(lastTrigger);
  initialScale = 1;
  resetScale();
  lightboxImage.src = image.currentSrc || image.src;
  lightboxImage.alt = image.alt || "Imagen ampliada";
  lightboxImage.addEventListener("load", () => applyInitialScale(modal), { once: true });
  if (!modal.open) modal.showModal();
  if (lightboxImage.complete) applyInitialScale(modal);
  modal.querySelector("[data-lightbox-action='close']")?.focus({ preventScroll: true });
  restoreScrollPositions(scrollPositionsBeforeLightbox);
}

export function openLightboxForTest({ src, alt = "Imagen ampliada de prueba" } = {}) {
  const modal = ensureLightbox();
  lastTrigger = null;
  scrollPositionsBeforeLightbox = captureScrollPositions(null);
  initialScale = 1;
  resetScale();
  lightboxImage.src = src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540' viewBox='0 0 960 540'%3E%3Crect width='960' height='540' fill='%23252b31'/%3E%3Ctext x='480' y='285' fill='white' font-size='42' text-anchor='middle' font-family='sans-serif'%3EImagen de prueba%3C/text%3E%3C/svg%3E";
  lightboxImage.alt = alt;
  lightboxImage.addEventListener("load", () => applyInitialScale(modal), { once: true });
  if (!modal.open) modal.showModal();
  if (lightboxImage.complete) applyInitialScale(modal);
  modal.querySelector("[data-lightbox-action='close']")?.focus({ preventScroll: true });
  restoreScrollPositions(scrollPositionsBeforeLightbox);
}

function closeLightbox() {
  if (!lightbox?.open) return;
  const scrollPositions = scrollPositionsBeforeLightbox;
  lightbox.close();
  lightboxImage?.removeAttribute("src");
  lastTrigger?.focus?.({ preventScroll: true });
  restoreScrollPositions(scrollPositions);
  lastTrigger = null;
  scrollPositionsBeforeLightbox = null;
  initialScale = 1;
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

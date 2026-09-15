const LIGHTBOX_ID = "imageLightbox";
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

let lightbox = null;
let lightboxImage = null;
let zoomLabel = null;
let scale = 1;
let lastTrigger = null;

function ensureLightbox() {
  if (lightbox) return lightbox;

  lightbox = document.createElement("dialog");
  lightbox.id = LIGHTBOX_ID;
  lightbox.className = "image-lightbox";
  lightbox.setAttribute("aria-label", "Visor de imagen");
  lightbox.innerHTML = `
    <div class="image-lightbox-surface">
      <div class="image-lightbox-toolbar" data-lightbox-action="dismiss">
        <button class="image-lightbox-button" type="button" data-lightbox-action="zoom-out" aria-label="Alejar imagen">−</button>
        <span class="image-lightbox-zoom-label" aria-live="polite">100%</span>
        <button class="image-lightbox-button" type="button" data-lightbox-action="zoom-in" aria-label="Acercar imagen">+</button>
        <button class="image-lightbox-button image-lightbox-close" type="button" data-lightbox-action="close" aria-label="Cerrar imagen">×</button>
      </div>
      <div class="image-lightbox-viewport" data-lightbox-action="dismiss">
        <img class="image-lightbox-image" alt="" draggable="false" />
      </div>
    </div>
  `;
  document.body.append(lightbox);
  lightboxImage = lightbox.querySelector(".image-lightbox-image");
  zoomLabel = lightbox.querySelector(".image-lightbox-zoom-label");

  lightbox.addEventListener("click", (event) => {
    const action = event.target.closest("[data-lightbox-action]")?.dataset.lightboxAction;
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
    closeLightbox();
  });
  lightbox.querySelector(".image-lightbox-viewport")?.addEventListener("wheel", (event) => {
    event.preventDefault();
    changeScale(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
  }, { passive: false });
  document.addEventListener("keydown", handleKeydown);
  return lightbox;
}

function changeScale(delta) {
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
}

function resetScale() {
  scale = 1;
  lightboxImage?.style.setProperty("--image-lightbox-scale", scale);
  if (zoomLabel) zoomLabel.textContent = "100%";
}

function openLightbox(image) {
  const modal = ensureLightbox();
  lastTrigger = image.closest(".message-media-link") || image;
  resetScale();
  lightboxImage.src = image.currentSrc || image.src;
  lightboxImage.alt = image.alt || "Imagen ampliada";
  if (!modal.open) modal.showModal();
  modal.querySelector("[data-lightbox-action='close']")?.focus();
}

function closeLightbox() {
  if (!lightbox?.open) return;
  lightbox.close();
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
  const image = event.target.closest(".message-media-link > .message-media");
  if (!image) return;
  event.preventDefault();
  event.stopPropagation();
  openLightbox(image);
}, true);

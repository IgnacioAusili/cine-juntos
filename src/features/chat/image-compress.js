import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";

export function compressImageBase64(base64Str, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    callback(compressedDataUrl);
  };
}

export function renderImagePreview(isOverlay) {
  const container = isOverlay ? dom.overlayImagePreview : dom.imagePreview;
  const base64 = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;

  if (!container) return;

  if (!base64) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="preview-box">
      <img src="${base64}" alt="Miniatura de imagen pegada" />
      <button type="button" class="preview-remove-btn" aria-label="Quitar imagen">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  container.querySelector(".preview-remove-btn").addEventListener("click", () => {
    clearPendingImage(isOverlay);
  });
}

export function clearPendingImage(isOverlay) {
  if (isOverlay) {
    state.chat.pendingOverlayImage = "";
  } else {
    state.chat.pendingImage = "";
  }
  renderImagePreview(isOverlay);
}

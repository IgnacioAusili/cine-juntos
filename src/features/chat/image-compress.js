import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js?v=20260902-mobile-real-browser-01";
import {
  isPinnedToBottom,
  queuePinnedChatScrollSync,
} from "./chat-scroll-sync.js?v=20260904-mobile-landscape-bottom-chat-07";

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
  const images = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const messagesContainer = isOverlay ? dom.overlayMessages : dom.messages;
  const wasPinnedToBottom = isPinnedToBottom(messagesContainer);

  if (!container) return;

  if (!Array.isArray(images) || !images.length) {
    container.hidden = true;
    container.innerHTML = "";
    queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
    return;
  }

  container.hidden = false;
  container.innerHTML = images
    .slice(0, 2)
    .map(
      (image, index) => `
        <div class="preview-box">
          <img src="${image}" alt="Miniatura de imagen pegada ${index + 1}" />
          <button type="button" class="preview-remove-btn" data-index="${index}" aria-label="Quitar imagen ${index + 1}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `,
    )
    .join("");

  container.querySelectorAll(".preview-remove-btn").forEach((button) => {
    button.addEventListener("click", () => {
      removePendingImage(isOverlay, Number.parseInt(button.dataset.index || "0", 10));
    });
  });

  queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
}

export function clearPendingImage(isOverlay) {
  if (isOverlay) {
    state.chat.pendingOverlayImage = [];
  } else {
    state.chat.pendingImage = [];
  }
  renderImagePreview(isOverlay);
}

function removePendingImage(isOverlay, index) {
  const nextImages = (isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage).slice();
  if (index >= 0 && index < nextImages.length) {
    nextImages.splice(index, 1);
  }

  if (isOverlay) {
    state.chat.pendingOverlayImage = nextImages;
  } else {
    state.chat.pendingImage = nextImages;
  }

  renderImagePreview(isOverlay);
}

import { dom } from "../../core/dom.js?v=20261011-bem-itcss-oocss-04";
import { state } from "../../core/state.js?v=20261011-bem-itcss-oocss-04";
import {
  isPinnedToBottom,
  queuePinnedChatScrollSync,
} from "./chat-scroll-sync.js?v=20261011-bem-itcss-oocss-04";
import { createForeignDocumentIcon } from "../foreign-lucide-icon.js?v=20261011-lucide-icons-repair-01";

function hydrateImagePreviewIcons(container) {
  if (container.ownerDocument === document) {
    window.lucide?.createIcons();
    return;
  }

  container.querySelectorAll("[data-lucide]").forEach((placeholder) => {
    placeholder.replaceWith(
      createForeignDocumentIcon(
        container.ownerDocument,
        placeholder.getAttribute("data-lucide"),
      ),
    );
  });
}

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
        <div class="image-preview-container__item">
          <a class="message__media-link image-preview-container__image-trigger" href="${image}" aria-label="Abrir imagen adjunta ${index + 1}">
            <img class="message__media" src="${image}" alt="Miniatura de imagen pegada ${index + 1}" />
          </a>
          <button type="button" class="image-preview-container__remove-button" data-index="${index}" aria-label="Quitar imagen ${index + 1}">
            <span data-lucide="x" aria-hidden="true"></span>
          </button>
        </div>
      `,
    )
    .join("");
  hydrateImagePreviewIcons(container);

  container.querySelectorAll('.image-preview-container__remove-button').forEach((button) => {
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

import {
  dom,
} from "../../core/dom.js";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js";
import {
  EMOJIS,
  MAX_CHARS,
} from "../../core/utils.js";
import {
  setSyncStatus,
} from "../session-ui.js";
import { clearReplyTarget } from "./chat-reply.js";
import { renderMessage } from "./chat-render.js";
import {
  compressImageBase64,
  renderImagePreview,
  clearPendingImage,
} from "./image-compress.js";

export function sendMessage(text, attachedImage) {
  if (!state.session.activeRoom || !state.session.transport) {
    setSyncStatus("Primero entra a una sala.");
    logEvent("chat", "Mensaje no enviado: falta sala.");
    return false;
  }

  const videoEl = dom.videoPlayer;
  const isPlaying =
    videoEl &&
    !videoEl.paused &&
    !videoEl.ended &&
    Number.isFinite(videoEl.currentTime) &&
    videoEl.currentTime > 0;

  const message = {
    id: crypto.randomUUID(),
    from: state.session.clientId,
    name: getDisplayName(),
    text: text || "",
    image: Array.isArray(attachedImage) && attachedImage.length ? attachedImage[0] : attachedImage || null,
    images: Array.isArray(attachedImage) ? attachedImage.slice(0, 2) : attachedImage ? [attachedImage] : [],
    replyTo: state.chat.replyTarget
      ? {
          id: state.chat.replyTarget.id,
          from: state.chat.replyTarget.from || null,
          name: state.chat.replyTarget.name,
          text: state.chat.replyTarget.text,
        }
      : null,
    createdAt: getTransportNow(),
  };

  if (isPlaying) {
    message.videoTimestamp = videoEl.currentTime;
  }

  state.session.transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar mensaje: ${error.message || error}`);
    setSyncStatus("No se pudo enviar el mensaje.");
  });

  if (state.session.transport.mode === "local") renderMessage(message);
  clearReplyTarget();
  logEvent("chat:send", `Mensaje de ${message.name}.`);
  return true;
}

export function submitMessageFrom(input) {
  const isOverlay = input === dom.overlayMessageInput;
  const text = input.value.trim();
  const img = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const hasImages = Array.isArray(img) ? img.length > 0 : Boolean(img);

  if (!text && !hasImages) return;

  if (input.value.length > MAX_CHARS) {
    const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
    if (counter) {
      counter.classList.add("char-counter--shake");
      window.setTimeout(() => counter.classList.remove("char-counter--shake"), 500);
    }
    return;
  }

  const wasQueued = sendMessage(text, img);
  if (!wasQueued) return;

  input.value = "";
  updateCharCounter(input, isOverlay);
  if (isOverlay) {
    clearPendingImage(true);
    dom.overlayMessageInput.focus();
  } else {
    clearPendingImage(false);
  }
  autoResizeMessageInput(input);
}

export function handlePasteEvent(event, isOverlay) {
  const items = event.clipboardData?.items;
  if (!items) return;
  const pending = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;

  if (Array.isArray(pending) && pending.length >= 2) {
    if (Array.from(items).some((item) => item.type.indexOf("image") !== -1)) {
      event.preventDefault();
    }
    return;
  }

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const rawBase64 = loadEvent.target.result;
        compressImageBase64(rawBase64, 800, 800, 0.7, (compressedBase64) => {
          const nextImages = (isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage).slice(0, 2);
          if (nextImages.length >= 2) return;
          nextImages.push(compressedBase64);
          if (isOverlay) {
            state.chat.pendingOverlayImage = nextImages;
          } else {
            state.chat.pendingImage = nextImages;
          }
          renderImagePreview(isOverlay);
        });
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}

export function autoResizeMessageInput(input) {
  input.style.height = "auto";
  const maxHeight = input === dom.overlayMessageInput ? 86 : 118;
  const minHeight = input === dom.overlayMessageInput ? 28 : 36;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  const wrapper = input.closest(".input-wrapper");
  if (wrapper) {
    wrapper.dataset.expanded = String(input.scrollHeight > minHeight + 4);
  }
  input.scrollTop = input.scrollHeight;
  syncComposerScrollbar(input);
}

export function buildEmojiPicker() {
  dom.emojiPopover.innerHTML = "";
  EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.className = "emoji-option";
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      insertEmoji(emoji);
    });
    dom.emojiPopover.append(button);
  });
}

export function toggleEmojiPicker(input, anchor) {
  state.ui.activeEmojiInput = input;
  if (!dom.emojiPopover.hidden && dom.emojiPopover.dataset.anchor === anchor.id) {
    hideEmojiPicker();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  dom.emojiPopover.hidden = false;
  dom.emojiPopover.dataset.anchor = anchor.id;
  const top = Math.max(8, rect.top - dom.emojiPopover.offsetHeight - 8);
  const left = Math.min(window.innerWidth - dom.emojiPopover.offsetWidth - 8, Math.max(8, rect.left));
  dom.emojiPopover.style.top = `${top}px`;
  dom.emojiPopover.style.left = `${left}px`;
}

export function hideEmojiPicker() {
  dom.emojiPopover.hidden = true;
  dom.emojiPopover.dataset.anchor = "";
}

function insertEmoji(emoji) {
  if (!state.ui.activeEmojiInput) return;
  const start = state.ui.activeEmojiInput.selectionStart ?? state.ui.activeEmojiInput.value.length;
  const end = state.ui.activeEmojiInput.selectionEnd ?? state.ui.activeEmojiInput.value.length;
  state.ui.activeEmojiInput.value = `${state.ui.activeEmojiInput.value.slice(0, start)}${emoji}${state.ui.activeEmojiInput.value.slice(end)}`;
  const nextPosition = start + emoji.length;
  state.ui.activeEmojiInput.focus();
  state.ui.activeEmojiInput.setSelectionRange(nextPosition, nextPosition);
  hideEmojiPicker();
}

export function updateCharCounter(input, isOverlay) {
  const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
  const form = isOverlay ? dom.overlayMessageForm : dom.messageForm;
  const sendBtn = isOverlay ? dom.overlayMessageSend : dom.mainMessageSend;
  const len = input.value.length;

  if (counter) {
    counter.textContent = `${len} / ${MAX_CHARS}`;
  }

  const isOver = len > MAX_CHARS;
  form.classList.toggle("over-limit", isOver);
  if (sendBtn) {
    sendBtn.disabled = isOver;
    sendBtn.setAttribute("aria-disabled", String(isOver));
  }
}

export function wireComposerScrollbar(input) {
  if (!input || input.dataset.composerScrollbarBound === "true") return;
  input.dataset.composerScrollbarBound = "true";

  const update = () => syncComposerScrollbar(input);
  input.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

function syncComposerScrollbar(input) {
  const shell = input?.closest(".textarea-shell");
  const thumb = shell?.querySelector(".composer-scrollbar-thumb");
  if (!shell || !thumb) return;

  const overflow = input.scrollHeight - input.clientHeight;
  if (overflow <= 1) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const track = shell.querySelector(".composer-scrollbar");
  const trackHeight = Math.max(0, track?.clientHeight || 0);
  const ratio = input.clientHeight / input.scrollHeight;
  const thumbHeight = Math.max(12, Math.min(trackHeight, Math.round(trackHeight * ratio)));
  const maxOffset = Math.max(0, trackHeight - thumbHeight);
  const scrollRatio = input.scrollTop / overflow;
  const top = Math.round(maxOffset * scrollRatio);

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${top}px)`;
  shell.setAttribute("data-scrollbar-visible", "true");
}

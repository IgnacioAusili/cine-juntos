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
    image: attachedImage || null,
    replyTo: state.chat.replyTarget
      ? {
          id: state.chat.replyTarget.id,
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

  if (!text && !img) return;

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

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const rawBase64 = loadEvent.target.result;
        compressImageBase64(rawBase64, 800, 800, 0.7, (compressedBase64) => {
          if (isOverlay) {
            state.chat.pendingOverlayImage = compressedBase64;
          } else {
            state.chat.pendingImage = compressedBase64;
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
  input.style.height = `${Math.min(input.scrollHeight, input === dom.overlayMessageInput ? 86 : 118)}px`;
  input.scrollTop = input.scrollHeight;
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

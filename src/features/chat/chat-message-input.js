import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, getDisplayName, getTransportNow, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { MAX_CHARS, replaceEmojiShortcodes } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { createRandomId } from "../../core/random-id.js?v=20261010-file-size-refactor-02";
import { setSyncStatus } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { markParticipantActive } from "../presence.js?v=20261011-chat-ui-fixes-03";
import { clearReplyTarget } from "./chat-reply.js?v=20261011-chat-ui-fixes-03";
import { renderMessage } from "./chat-render.js?v=20261011-overlay-scroll-top-01";
import { completeAutoOpenedChatResponse } from "./chat-layout.js?v=20261011-chat-ui-fixes-03";
import { queuePinnedChatScrollSync } from "./chat-scroll-sync.js?v=20261011-chat-interaction-fixes-01";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import { compressImageBase64, renderImagePreview, clearPendingImage } from "./image-compress.js?v=20261011-chat-interaction-fixes-01";
import { isMobileLayout, logMobileInteraction } from "./chat-input-debug.js?v=20261010-file-size-refactor-02";
import { normalizeEmojiShortcodesInput } from "./emoji-picker.js?v=20261010-file-size-refactor-02";
import { getSpamCooldownRemaining, hashImageFingerprint, registerMessageForSpamCheck, updateCharCounter, updateSpamCooldownButtons } from "./chat-spam-guard.js?v=20261011-chat-ui-fixes-03";
import { autoResizeMessageInput } from "./chat-input-layout.js?v=20261011-chat-interaction-fixes-01";

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
    id: createRandomId(),
    from: state.session.clientId,
    name: getDisplayName(),
    text: replaceEmojiShortcodes(text || ""),
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

  markParticipantActive(state.session.clientId, message.name);
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
  logMobileInteraction("submit:start", input, { isOverlay, triggerActiveElement: document.activeElement?.id || null });
  normalizeEmojiShortcodesInput(input);
  const text = input.value.trim();
  const img = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const hasImages = Array.isArray(img) ? img.length > 0 : Boolean(img);

  if (!text && !hasImages) {
    logMobileInteraction("submit:ignored-empty", input, { isOverlay });
    return;
  }

  if (input.value.length >= MAX_CHARS) {
    const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
    if (counter) {
      counter.classList.add("char-counter--shake");
      window.setTimeout(() => counter.classList.remove("char-counter--shake"), 500);
    }
    return;
  }

  if (getSpamCooldownRemaining()) {
    updateSpamCooldownButtons();
    if (!isMobileLayout()) focusChatInput(input);
    return;
  }

  if (
    state.session.activeRoom &&
    state.session.transport &&
    !registerMessageForSpamCheck(text, img)
  ) {
    if (!isMobileLayout()) focusChatInput(input);
    return;
  }

  const wasQueued = sendMessage(text, img);
  if (!wasQueued) {
    logMobileInteraction("submit:not-queued", input, { isOverlay });
    return;
  }

  input.value = "";
  updateCharCounter(input, isOverlay);
  if (isOverlay) {
    clearPendingImage(true);
  } else {
    clearPendingImage(false);
  }
  completeAutoOpenedChatResponse(isOverlay);
  autoResizeMessageInput(input);
  if (!isMobileLayout()) {
    focusChatInput(input);
    logMobileInteraction("submit:after-focus", input, { isOverlay });
  }
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
          const fingerprint = hashImageFingerprint(compressedBase64);
          if (fingerprint && nextImages.some((image) => hashImageFingerprint(image) === fingerprint)) return;
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

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
  EMOJI_PICKER_ITEMS,
  MAX_CHARS,
  replaceEmojiShortcodes,
  withShortcutHint,
} from "../../core/utils.js";
import {
  setSyncStatus,
} from "../session-ui.js";
import { refreshTooltipForTarget } from "../icons-tooltips.js";
import { markParticipantActive } from "../presence.js";
import { clearReplyTarget } from "./chat-reply.js";
import { renderMessage } from "./chat-render.js?v=20260801-05";
import {
  scheduleExternalChatAutoCollapse,
  scheduleInsideChatAutoCollapse,
} from "./chat-layout.js";
import { queuePinnedChatScrollSync, isPinnedToBottom } from "./chat-scroll-sync.js";
import {
  compressImageBase64,
  renderImagePreview,
  clearPendingImage,
} from "./image-compress.js";

const floatingComposerObservers = new WeakMap();
const sendButtonMarkup = new WeakMap();
const SAME_MESSAGE_LIMIT = 4;
const SAME_MESSAGE_WINDOW_MS = 2500;
const RAPID_MESSAGE_LIMIT = 5;
const RAPID_MESSAGE_WINDOW_MS = 1000;
const SPAM_COOLDOWN_MS = 15000;
const PROGRESS_APPEAR_THRESHOLD = 150;

let lastMessageSpamKey = "";
let sameMessageCount = 0;
let lastMessageSentAt = 0;
let recentMessageSentAt = [];
let spamCooldownUntil = 0;
let spamCooldownTimer = 0;

function getSendButtons() {
  return [dom.mainMessageSend, dom.overlayMessageSend].filter(Boolean);
}

function getSpamCooldownRemaining() {
  return Math.max(0, spamCooldownUntil - Date.now());
}

function getSpamKey(text, attachedImage) {
  const normalizedText = String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  const imageCount = Array.isArray(attachedImage)
    ? attachedImage.length
    : attachedImage
      ? 1
      : 0;
  return `${normalizedText}|images:${imageCount}`;
}

function restoreSendButton(button) {
  if (!button?.dataset.spamCooldown) return;
  const original = sendButtonMarkup.get(button);
  if (original) button.innerHTML = original;
  sendButtonMarkup.delete(button);
  delete button.dataset.spamCooldown;
}

function showSendCooldown(button, seconds) {
  if (!button) return;
  if (!button.dataset.spamCooldown) {
    sendButtonMarkup.set(button, button.innerHTML);
    button.innerHTML = "<span class='send-cooldown' aria-hidden='true'></span>";
    button.dataset.spamCooldown = "true";
  }

  const counter = button.querySelector(".send-cooldown");
  if (counter) counter.textContent = String(seconds);
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.setAttribute("aria-label", `Debés esperar ${seconds} segundos para volver a enviar`);
  button.dataset.tooltip = `Debés esperar ${seconds} segundos para volver a enviar`;
  refreshTooltipForTarget(button);
}

function finishSpamCooldown() {
  spamCooldownUntil = 0;
  spamCooldownTimer = 0;
  getSendButtons().forEach(restoreSendButton);
  if (dom.messageInput) updateCharCounter(dom.messageInput, false);
  if (dom.overlayMessageInput) updateCharCounter(dom.overlayMessageInput, true);
}

function updateSpamCooldownButtons() {
  const remaining = getSpamCooldownRemaining();
  if (!remaining) {
    finishSpamCooldown();
    return;
  }

  const seconds = Math.ceil(remaining / 1000);
  getSendButtons().forEach((button) => showSendCooldown(button, seconds));
  spamCooldownTimer = window.setTimeout(updateSpamCooldownButtons, 250);
}

function startSpamCooldown() {
  lastMessageSpamKey = "";
  sameMessageCount = 0;
  lastMessageSentAt = 0;
  recentMessageSentAt = [];
  spamCooldownUntil = Date.now() + SPAM_COOLDOWN_MS;
  window.clearTimeout(spamCooldownTimer);
  updateSpamCooldownButtons();
  logEvent("chat", "Envío pausado temporalmente por mensajes repetidos.");
}

function registerMessageForSpamCheck(text, attachedImage) {
  const now = Date.now();
  recentMessageSentAt = recentMessageSentAt.filter(
    (sentAt) => now - sentAt < RAPID_MESSAGE_WINDOW_MS,
  );
  if (recentMessageSentAt.length >= RAPID_MESSAGE_LIMIT) {
    startSpamCooldown();
    return false;
  }

  const spamKey = getSpamKey(text, attachedImage);
  if (
    spamKey === lastMessageSpamKey &&
    now - lastMessageSentAt <= SAME_MESSAGE_WINDOW_MS
  ) {
    sameMessageCount += 1;
  } else {
    lastMessageSpamKey = spamKey;
    sameMessageCount = 1;
  }
  lastMessageSentAt = now;
  recentMessageSentAt.push(now);

  if (sameMessageCount > SAME_MESSAGE_LIMIT) {
    startSpamCooldown();
    return false;
  }
  return true;
}

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
  normalizeEmojiShortcodesInput(input);
  const text = input.value.trim();
  const img = isOverlay ? state.chat.pendingOverlayImage : state.chat.pendingImage;
  const hasImages = Array.isArray(img) ? img.length > 0 : Boolean(img);

  if (!text && !hasImages) return;

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
    input.focus({ preventScroll: true });
    return;
  }

  if (
    state.session.activeRoom &&
    state.session.transport &&
    !registerMessageForSpamCheck(text, img)
  ) {
    input.focus({ preventScroll: true });
    return;
  }

  const wasQueued = sendMessage(text, img);
  if (!wasQueued) return;

  input.value = "";
  updateCharCounter(input, isOverlay);
  if (isOverlay) {
    clearPendingImage(true);
  } else {
    clearPendingImage(false);
  }
  autoResizeMessageInput(input);
  input.focus({ preventScroll: true });
  if (isOverlay) {
    scheduleInsideChatAutoCollapse();
  } else {
    scheduleExternalChatAutoCollapse();
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
  const isOverlay = input === dom.overlayMessageInput;
  const messagesContainer = isOverlay ? dom.overlayMessages : dom.messages;
  const wasPinnedToBottom = isPinnedToBottom(messagesContainer);

  input.style.height = "auto";
  const maxHeight = isOverlay ? 86 : 118;
  const minHeight = isOverlay ? 28 : 36;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  const wrapper = input.closest(".input-wrapper");
  if (wrapper) {
    wrapper.dataset.expanded = String(input.scrollHeight > minHeight + 4);
  }
  input.scrollTop = input.scrollHeight;
  syncComposerScrollbar(input);
  queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
}

export function buildEmojiPicker() {
  dom.emojiPopover.innerHTML = "";
  EMOJI_PICKER_ITEMS.forEach(({ emoji, tags }) => {
    const button = document.createElement("button");
    button.className = "emoji-option";
    button.type = "button";
    const tooltip = tags?.length ? `:${tags[0]}:` : "";
    button.setAttribute("aria-label", `Insertar ${emoji}`);
    if (tooltip) {
      button.title = tooltip;
    }
    button.textContent = emoji;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
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

  const selectionStart = input?.selectionStart ?? input?.value.length ?? 0;
  const selectionEnd = input?.selectionEnd ?? input?.value.length ?? 0;
  const rect = anchor.getBoundingClientRect();
  dom.emojiPopover.hidden = false;
  dom.emojiPopover.dataset.anchor = anchor.id;
  const top = Math.max(8, rect.top - dom.emojiPopover.offsetHeight - 8);
  const left = Math.min(window.innerWidth - dom.emojiPopover.offsetWidth - 8, Math.max(8, rect.left));
  dom.emojiPopover.style.top = `${top}px`;
  dom.emojiPopover.style.left = `${left}px`;

  window.requestAnimationFrame(() => {
    input?.focus({ preventScroll: true });
    if (typeof input?.setSelectionRange === "function") {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

export function hideEmojiPicker() {
  dom.emojiPopover.hidden = true;
  dom.emojiPopover.dataset.anchor = "";
}

export function normalizeEmojiShortcodesInput(input) {
  if (!input) return false;

  const originalValue = input.value;
  if (!originalValue.includes(":")) return false;

  const selectionStart = input.selectionStart ?? originalValue.length;
  const selectionEnd = input.selectionEnd ?? originalValue.length;
  const nextValue = replaceEmojiShortcodes(originalValue);
  if (nextValue === originalValue) return false;

  input.value = nextValue;

  if (typeof input.setSelectionRange === "function") {
    const nextStart = replaceEmojiShortcodes(originalValue.slice(0, selectionStart)).length;
    const nextEnd = replaceEmojiShortcodes(originalValue.slice(0, selectionEnd)).length;
    input.setSelectionRange(nextStart, nextEnd);
  }

  return true;
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
  const remaining = Math.max(0, MAX_CHARS - len);
  const progress = Math.min(1, len / MAX_CHARS);
  const isOver = len >= MAX_CHARS;
  const isNearLimit = !isOver && remaining <= 20;
  const progressColor = isOver
    ? "rgba(233, 68, 68, 1)"
    : isNearLimit
      ? "rgba(255, 145, 72, 1)"
      : "rgba(47, 184, 164, 1)";
  const progressTrack = isOver
    ? "rgba(233, 68, 68, 0.16)"
    : isNearLimit
      ? "rgba(255, 145, 72, 0.22)"
      : "rgba(255, 255, 255, 0.12)";
  const progressVisible = len >= PROGRESS_APPEAR_THRESHOLD ? 1 : 0;

  if (counter) {
    counter.textContent = `${len} / ${MAX_CHARS}`;
    counter.setAttribute("aria-hidden", "true");
  }

  form.classList.toggle("over-limit", isOver);
  if (sendBtn) {
    const cooldownRemaining = getSpamCooldownRemaining();
    if (cooldownRemaining) {
      showSendCooldown(sendBtn, Math.ceil(cooldownRemaining / 1000));
    } else {
      restoreSendButton(sendBtn);
      sendBtn.disabled = isOver;
      sendBtn.setAttribute("aria-disabled", String(isOver));
      if (isOver) {
        sendBtn.dataset.tooltip = "Borra texto para poder enviar el mensaje";
        sendBtn.setAttribute("aria-label", "Borra texto para poder enviar");
      } else {
        const tooltip = withShortcutHint("Enviar mensaje", "Enter");
        sendBtn.dataset.tooltip = tooltip;
        sendBtn.setAttribute("aria-label", tooltip);
      }
    }
    sendBtn.style.setProperty("--composer-progress", String(progress));
    sendBtn.style.setProperty("--composer-progress-length", String(progress * 100));
    sendBtn.style.setProperty("--composer-progress-color", progressColor);
    sendBtn.style.setProperty("--composer-progress-track", progressTrack);
    sendBtn.style.setProperty("--composer-progress-visible", String(progressVisible));
    sendBtn.style.setProperty("--composer-progress-scale", progressVisible ? "1" : "0.78");
    sendBtn.dataset.nearLimit = String(isNearLimit);
    sendBtn.dataset.overLimit = String(isOver);
    refreshTooltipForTarget(sendBtn);
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

export function wireFloatingComposerLayout() {
  [dom.messageForm, dom.overlayMessageForm].forEach((form) => {
    if (!form || floatingComposerObservers.has(form)) return;

    const container = form.closest(".chat-area, .player-chat");
    if (!container) return;
    const messagesContainer = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;

    const updateReserve = () => {
      const wasPinnedToBottom = isPinnedToBottom(messagesContainer);
      const reserve = Math.ceil(form.getBoundingClientRect().height);
      const computedStyle = window.getComputedStyle(form);
      const bottomGap = Math.max(0, Math.round(Number.parseFloat(computedStyle.bottom) || 0));
      const messageReserve = reserve + bottomGap + 2;
      container.style.setProperty("--chat-composer-reserve", `${reserve}px`);
      container.style.setProperty("--chat-message-bottom-reserve", `${messageReserve}px`);
      if (wasPinnedToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    const observer = new ResizeObserver(() => {
      updateReserve();
    });

    floatingComposerObservers.set(form, observer);
    observer.observe(form);
    updateReserve();
  });
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

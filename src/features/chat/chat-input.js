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
import { markParticipantActive } from "../presence.js?v=20260824-name-commit-reveal-02";
import { clearReplyTarget } from "./chat-reply.js?v=20260814-reply-preview-sharp-01";
import { renderMessage } from "./chat-render.js?v=20260823-system-message-drum-09";
import {
  completeAutoOpenedChatResponse,
} from "./chat-layout.js?v=20260811-text-stable-motion-01";
import { queuePinnedChatScrollSync, isPinnedToBottom } from "./chat-scroll-sync.js?v=20260810-chat-fixes-01";
import {
  compressImageBase64,
  renderImagePreview,
  clearPendingImage,
} from "./image-compress.js";

const floatingComposerObservers = new WeakMap();
const scrollbarDragState = new WeakMap();
const CHAT_MESSAGE_BOTTOM_GAP = 12;
const CHAT_OVERLAY_MESSAGE_BOTTOM_GAP = 4;
const sendButtonMarkup = new WeakMap();
const SAME_MESSAGE_LIMIT = 4;
const SAME_MESSAGE_WINDOW_MS = 2500;
const RAPID_MESSAGE_LIMIT = 5;
const RAPID_MESSAGE_WINDOW_MS = 1000;
const TEXT_SPAM_COOLDOWN_MS = 15000;
const IMAGE_RAPID_LIMIT = 4;
const IMAGE_RAPID_WINDOW_MS = 2500;
const IMAGE_SPAM_COOLDOWN_MS = 30000;
const IMAGE_FINGERPRINT_CACHE_LIMIT = 100;
const PROGRESS_APPEAR_THRESHOLD = 150;
let emojiFontReady = null;

let lastMessageSpamKey = "";
let sameMessageCount = 0;
let lastMessageSentAt = 0;
let recentMessageSentAt = [];
let recentImageSentAt = [];
let sentImageFingerprintQueue = [];
let sentImageFingerprintSet = new Set();
let spamCooldownUntil = 0;
let spamCooldownTimer = 0;

function preloadEmojiFont() {
  if (emojiFontReady) return emojiFontReady;
  if (!document.fonts?.load) return Promise.resolve();

  emojiFontReady = document.fonts
    .load('0.82rem "Noto Color Emoji"', "😂🫦")
    .catch(() => undefined);
  return emojiFontReady;
}

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

function getAttachedImages(attachedImage) {
  return Array.isArray(attachedImage)
    ? attachedImage.filter(Boolean)
    : attachedImage
      ? [attachedImage]
      : [];
}

function hashImageFingerprint(image) {
  const value = String(image || "").trim();
  if (!value) return "";

  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `img:${(hash >>> 0).toString(16)}`;
}

function getImageFingerprints(attachedImage) {
  const fingerprints = getAttachedImages(attachedImage)
    .map((image) => hashImageFingerprint(image))
    .filter(Boolean);
  return [...new Set(fingerprints)];
}

function commitImageSpamState(fingerprints, now) {
  if (!fingerprints.length) return;

  const timestamp = Number.isFinite(now) ? now : Date.now();
  recentImageSentAt = recentImageSentAt.filter(
    (sentAt) => timestamp - sentAt < IMAGE_RAPID_WINDOW_MS,
  );
  recentImageSentAt.push(timestamp);

  for (const fingerprint of fingerprints) {
    if (sentImageFingerprintSet.has(fingerprint)) continue;
    sentImageFingerprintSet.add(fingerprint);
    sentImageFingerprintQueue.push(fingerprint);
  }

  while (sentImageFingerprintQueue.length > IMAGE_FINGERPRINT_CACHE_LIMIT) {
    const oldest = sentImageFingerprintQueue.shift();
    if (oldest) sentImageFingerprintSet.delete(oldest);
  }
}

function evaluateImageSpamCheck(attachedImage) {
  const fingerprints = getImageFingerprints(attachedImage);
  if (!fingerprints.length) {
    return { allowed: true, fingerprints: [], now: Date.now() };
  }

  const now = Date.now();
  const duplicateWithinMessage = fingerprints.length !== getAttachedImages(attachedImage).length;
  const alreadySent = fingerprints.some((fingerprint) => sentImageFingerprintSet.has(fingerprint));
  if (duplicateWithinMessage || alreadySent) {
    setSyncStatus("Esa imagen ya se envió antes.");
    logEvent("chat", "Imagen bloqueada: duplicada.");
    return { allowed: false, fingerprints: [], now };
  }

  const recentImageCount = recentImageSentAt.filter(
    (sentAt) => now - sentAt < IMAGE_RAPID_WINDOW_MS,
  ).length;
  if (recentImageCount >= IMAGE_RAPID_LIMIT) {
    startSpamCooldown(
      IMAGE_SPAM_COOLDOWN_MS,
      "Envío pausado temporalmente por muchas imágenes seguidas.",
    );
    setSyncStatus("Demasiadas imágenes seguidas. Esperá 30 segundos.");
    return { allowed: false, fingerprints: [], now };
  }

  return { allowed: true, fingerprints, now };
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

function startSpamCooldown(durationMs = TEXT_SPAM_COOLDOWN_MS, reason = "Envío pausado temporalmente por mensajes repetidos.") {
  lastMessageSpamKey = "";
  sameMessageCount = 0;
  lastMessageSentAt = 0;
  recentMessageSentAt = [];
  recentImageSentAt = [];
  spamCooldownUntil = Date.now() + durationMs;
  window.clearTimeout(spamCooldownTimer);
  updateSpamCooldownButtons();
  logEvent("chat", reason);
}

function registerMessageForSpamCheck(text, attachedImage) {
  const imageCheck = evaluateImageSpamCheck(attachedImage);
  if (!imageCheck.allowed) return false;

  const now = Date.now();
  recentMessageSentAt = recentMessageSentAt.filter(
    (sentAt) => now - sentAt < RAPID_MESSAGE_WINDOW_MS,
  );
  if (recentMessageSentAt.length >= RAPID_MESSAGE_LIMIT) {
    startSpamCooldown(TEXT_SPAM_COOLDOWN_MS);
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
    startSpamCooldown(TEXT_SPAM_COOLDOWN_MS);
    return false;
  }

  commitImageSpamState(imageCheck.fingerprints, imageCheck.now);
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
  completeAutoOpenedChatResponse(isOverlay);
  autoResizeMessageInput(input);
  input.focus({ preventScroll: true });
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
  const minHeight = isOverlay ? 34 : 36;
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
  void preloadEmojiFont();
  dom.emojiPopover.innerHTML = "";
  syncEmojiTriggerState();
  EMOJI_PICKER_ITEMS.forEach(({ emoji, tags }) => {
    const button = document.createElement("button");
    button.className = "emoji-option";
    button.type = "button";
    const tooltip = tags?.length ? `:${tags[0]}:` : "";
    button.setAttribute("aria-label", `Insertar ${emoji}`);
    if (tooltip) {
      button.dataset.tooltip = tooltip;
      button.removeAttribute("title");
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

export async function toggleEmojiPicker(input, anchor) {
  state.ui.activeEmojiInput = input;
  if (!dom.emojiPopover.hidden && dom.emojiPopover.dataset.anchor === anchor.id) {
    hideEmojiPicker();
    return;
  }

  const selectionStart = input?.selectionStart ?? input?.value.length ?? 0;
  const selectionEnd = input?.selectionEnd ?? input?.value.length ?? 0;
  await preloadEmojiFont();
  const rect = anchor.getBoundingClientRect();
  dom.emojiPopover.hidden = false;
  dom.emojiPopover.dataset.anchor = anchor.id;
  const top = Math.max(8, rect.top - dom.emojiPopover.offsetHeight - 8);
  const left = Math.min(window.innerWidth - dom.emojiPopover.offsetWidth - 8, Math.max(8, rect.left));
  dom.emojiPopover.style.top = `${top}px`;
  dom.emojiPopover.style.left = `${left}px`;

  syncEmojiTriggerState(anchor);

  window.requestAnimationFrame(() => {
    input?.focus({ preventScroll: true });
    if (typeof input?.setSelectionRange === "function") {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  });
}

function syncEmojiTriggerState(activeAnchor = null) {
  [dom.messageEmojiButton, dom.overlayEmojiButton].forEach((button) => {
    if (!button) return;
    const isActive = button === activeAnchor;
    button.classList.toggle("is-emoji-picker-open", isActive);
    button.setAttribute("aria-expanded", String(isActive));
  });
}

export function hideEmojiPicker() {
  dom.emojiPopover.hidden = true;
  dom.emojiPopover.dataset.anchor = "";
  syncEmojiTriggerState();
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
    const messagesWrap = messagesContainer?.closest(".messages-wrap");
    const inputWrapper = form.querySelector(".input-wrapper");
    wireChatScrollbar(messagesContainer);

    const updateReserve = () => {
      const wasPinnedToBottom = isPinnedToBottom(messagesContainer);
      const reserve = Math.ceil(form.getBoundingClientRect().height);
      const computedStyle = window.getComputedStyle(form);
      const bottomGap = Math.max(0, Math.round(Number.parseFloat(computedStyle.bottom) || 0));
      const messageGap = form === dom.overlayMessageForm
        ? CHAT_OVERLAY_MESSAGE_BOTTOM_GAP
        : CHAT_MESSAGE_BOTTOM_GAP;
      const messageReserve = reserve + bottomGap + 2 + messageGap;
      if (messagesWrap && inputWrapper) {
        const messagesWrapRect = messagesWrap.getBoundingClientRect();
        const inputRect = inputWrapper.getBoundingClientRect();
        const visualEnd = Math.max(0, Math.round(inputRect.top - messagesWrapRect.top));
        messagesWrap.style.setProperty("--chat-scrollbar-visual-end", `${visualEnd}px`);
        syncChatScrollbar(messagesContainer);
      }
      container.style.setProperty("--chat-composer-reserve", `${reserve}px`);
      container.style.setProperty("--chat-message-bottom-reserve", `${messageReserve}px`);
      if (wasPinnedToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    let reserveFrame = 0;
    const scheduleReserveUpdate = () => {
      if (form === dom.messageForm && dom.sessionView?.classList.contains("chat-layout-transitioning")) return;
      if (reserveFrame) return;
      reserveFrame = window.requestAnimationFrame(() => {
        reserveFrame = 0;
        updateReserve();
      });
    };
    const observer = new ResizeObserver(scheduleReserveUpdate);

    floatingComposerObservers.set(form, observer);
    observer.observe(form);
    window.addEventListener("resize", scheduleReserveUpdate, { passive: true });
    if (form === dom.messageForm) {
      window.addEventListener("chat-layout-settled", scheduleReserveUpdate, { passive: true });
    }
    updateReserve();
  });
}

function wireChatScrollbar(messagesContainer) {
  if (!messagesContainer || messagesContainer.dataset.chatScrollbarBound === "true") return;
  messagesContainer.dataset.chatScrollbarBound = "true";

  const update = () => syncChatScrollbar(messagesContainer);
  messagesContainer.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("chat-layout-settled", update, { passive: true });
  wireChatScrollbarDragging(messagesContainer);
  update();
}

function wireChatScrollbarDragging(messagesContainer) {
  if (!messagesContainer || messagesContainer.dataset.chatScrollbarDragBound === "true") return;
  messagesContainer.dataset.chatScrollbarDragBound = "true";

  const shell = messagesContainer.closest(".messages-wrap");
  const track = shell?.querySelector(".chat-scrollbar");
  if (!shell || !track) return;

  const getThumb = () => shell.querySelector(".chat-scrollbar-thumb");

  const updateFromPointer = (clientY) => {
    const thumb = getThumb();
    if (!thumb) return;

    const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
    if (overflow <= 0) return;

    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const thumbHeight = Math.max(12, Math.round(thumbRect.height || 12));
    const maxOffset = Math.max(0, trackRect.height - thumbHeight);
    const dragState = scrollbarDragState.get(messagesContainer);
    const offsetWithinThumb = dragState?.offsetWithinThumb ?? thumbHeight / 2;
    const nextTop = Math.max(0, Math.min(maxOffset, clientY - trackRect.top - offsetWithinThumb));
    const scrollRatio = maxOffset <= 0 ? 0 : nextTop / maxOffset;
    messagesContainer.scrollTop = scrollRatio * overflow;
    syncChatScrollbar(messagesContainer);
  };

  const stopDragging = (event) => {
    const dragState = scrollbarDragState.get(messagesContainer);
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    scrollbarDragState.delete(messagesContainer);
    try {
      track.releasePointerCapture(event.pointerId);
    } catch {
      // Ignorado: el puntero ya pudo haberse liberado.
    }
    track.classList.remove("is-dragging");
    shell.classList.remove("is-dragging");
  };

  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const thumb = getThumb();
    if (!thumb) return;

    const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
    if (overflow <= 0) return;

    const thumbRect = thumb.getBoundingClientRect();
    const offsetWithinThumb = event.target === thumb || thumb.contains(event.target)
      ? Math.max(0, Math.min(thumbRect.height, event.clientY - thumbRect.top))
      : Math.max(0, thumbRect.height / 2);

    scrollbarDragState.set(messagesContainer, {
      pointerId: event.pointerId,
      offsetWithinThumb,
    });

    track.classList.add("is-dragging");
    shell.classList.add("is-dragging");

    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // Ignorado: algunos navegadores no permiten capturar ciertos punteros.
    }

    event.preventDefault();
    updateFromPointer(event.clientY);
  });

  track.addEventListener("pointermove", (event) => {
    const dragState = scrollbarDragState.get(messagesContainer);
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    updateFromPointer(event.clientY);
  });

  track.addEventListener("pointerup", stopDragging);
  track.addEventListener("pointercancel", stopDragging);
  track.addEventListener("lostpointercapture", stopDragging);
}

function syncChatScrollbar(messagesContainer) {
  const shell = messagesContainer?.closest(".messages-wrap");
  const track = shell?.querySelector(".chat-scrollbar");
  const thumb = shell?.querySelector(".chat-scrollbar-thumb");
  if (!shell || !track || !thumb) return;

  const isLayoutTransitioning = dom.sessionView?.classList.contains("chat-layout-transitioning")
    || dom.sessionView?.classList.contains("chat-dock-switching");
  if (isLayoutTransitioning) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
  if (overflow <= 1) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const trackHeight = Math.max(0, track.clientHeight);
  const ratio = messagesContainer.clientHeight / messagesContainer.scrollHeight;
  const thumbHeight = Math.max(12, Math.min(trackHeight, Math.round(trackHeight * ratio)));
  const maxOffset = Math.max(0, trackHeight - thumbHeight);
  const scrollRatio = messagesContainer.scrollTop / overflow;
  const top = Math.round(maxOffset * scrollRatio);

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${top}px)`;
  shell.setAttribute("data-scrollbar-visible", "true");
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

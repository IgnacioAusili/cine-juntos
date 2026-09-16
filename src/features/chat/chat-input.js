import {
  dom,
} from "../../core/dom.js";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js?v=20260914-console-log-controls-01";
import {
  EMOJI_PICKER_ITEMS,
  MAX_CHARS,
  replaceEmojiShortcodes,
  withShortcutHint,
} from "../../core/utils.js";
import { createRandomId } from "../../core/random-id.js?v=20260902-mobile-real-browser-02";
import {
  setSyncStatus,
} from "../session-ui.js?v=20260911-orientation-scroll-anchor-01";
import { refreshTooltipForTarget } from "../icons-tooltips.js?v=20260914-tooltip-single-path-01";
import { markParticipantActive } from "../presence.js?v=20260912-name-session-01";
import { clearReplyTarget } from "./chat-reply.js?v=20260914-system-message-roll-transition-05";
import { renderMessage } from "./chat-render.js?v=20260915-message-time-spacing-01";
import {
  completeAutoOpenedChatResponse,
} from "./chat-layout.js?v=20260914-fullscreen-dock-animation-16";
import { queuePinnedChatScrollSync, isPinnedToBottom } from "./chat-scroll-sync.js?v=20260904-mobile-landscape-bottom-chat-07";
import { focusChatInput } from "./chat-input-focus.js";
import {
  compressImageBase64,
  renderImagePreview,
  clearPendingImage,
} from "./image-compress.js";

const floatingComposerObservers = new WeakMap();
const scrollbarDragState = new WeakMap();
const CHAT_MESSAGE_BOTTOM_GAP = 12;
const CHAT_OVERLAY_MESSAGE_BOTTOM_GAP = 4;
const CHAT_RESERVE_TRANSITION_MS = 180;
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
const MOBILE_CHAT_LAYOUT_QUERY = "(max-width: 980px)";
const EMOJI_POPOVER_GAP_PX = 8;
const EMOJI_POPOVER_EDGE_PX = 8;
const EMOJI_POPOVER_BORDER_WIDTH_PX = 1;
const EMOJI_POPOVER_TAIL_INSET_PX = 20;
const EMOJI_POPOVER_TAIL_HEIGHT_PX = 8;
const EMOJI_POPOVER_TRANSITION_MS = 150;
const EMOJI_PAGE_COLUMNS = 7;
const EMOJI_PAGE_MAX_ROWS = 2;
const EMOJI_PAGE_MIN_CELL_PX = 20;
const EMOJI_FONT_SHORTHAND = '0.82rem "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji"';
const EMOJI_FONT_SAMPLE = "😂🫦❌👎✅👍🙏";
let emojiFontReady = null;
let emojiPopoverHideTimer = 0;
let emojiPickerOpenRequestId = 0;
let emojiPopoverOriginalParent = null;

let lastMessageSpamKey = "";
let sameMessageCount = 0;
let lastMessageSentAt = 0;
let recentMessageSentAt = [];
let recentImageSentAt = [];
let sentImageFingerprintQueue = [];
let sentImageFingerprintSet = new Set();
let spamCooldownUntil = 0;
let spamCooldownTimer = 0;

function isMobileLayout() {
  return Boolean(
    window.matchMedia
    && window.matchMedia(MOBILE_CHAT_LAYOUT_QUERY).matches,
  );
}

function syncFullscreenEmojiPopoverSurface(anchor) {
  const popover = dom.emojiPopover;
  if (!popover || !isMobileLayout() || !document.body.classList.contains("fullscreen-mode")) {
    return;
  }

  if (!emojiPopoverOriginalParent) {
    emojiPopoverOriginalParent = popover.parentElement;
  }

  const surface = anchor?.closest(".chat-area, .player-frame")
    || dom.chatArea
    || dom.playerFrame;
  if (surface && popover.parentElement !== surface) {
    surface.append(popover);
  }
}

function restoreEmojiPopoverSurface() {
  const popover = dom.emojiPopover;
  if (
    popover
    && emojiPopoverOriginalParent
    && popover.parentElement !== emojiPopoverOriginalParent
  ) {
    emojiPopoverOriginalParent.append(popover);
  }
  popover?.style.removeProperty("position");
}

function getMobileInteractionSnapshot(input = null) {
  const viewport = window.visualViewport;
  const keyboard = navigator.virtualKeyboard;
  return {
    layout: window.matchMedia?.(MOBILE_CHAT_LAYOUT_QUERY).matches ? "mobile" : "desktop",
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    input: input?.id || null,
    inputFocused: input ? document.activeElement === input : false,
    selection: input
      ? { start: input.selectionStart, end: input.selectionEnd, length: input.value.length }
      : null,
    popoverHidden: dom.emojiPopover?.hidden ?? null,
    popoverAnchor: dom.emojiPopover?.dataset.anchor || null,
    viewport: viewport
      ? { width: Math.round(viewport.width), height: Math.round(viewport.height), offsetTop: Math.round(viewport.offsetTop) }
      : null,
    window: { width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY || 0) },
    virtualKeyboard: keyboard
      ? { overlaysContent: Boolean(keyboard.overlaysContent), height: Math.round(keyboard.boundingRect?.height || 0) }
      : null,
  };
}

function logMobileInteraction(label, input = null, extra = {}) {
  if (
    input
    && (input !== dom.messageInput || dom.sessionView?.dataset.chatDock !== "bottom")
  ) return;
  logEvent("mobile-keyboard-debug", `${label} ${JSON.stringify({ ...getMobileInteractionSnapshot(input), ...extra })}`);
}

function preloadEmojiFont() {
  if (emojiFontReady) return emojiFontReady;
  if (!document.fonts?.load) return Promise.resolve();

  emojiFontReady = document.fonts
    .load(EMOJI_FONT_SHORTHAND, EMOJI_FONT_SAMPLE)
    .catch(() => undefined);
  return emojiFontReady;
}

function isLandscapeKeyboardEmojiLayout() {
  return Boolean(
    document.documentElement.classList.contains("viewport-landscape")
      && document.documentElement.classList.contains("bottom-chat-keyboard-open")
      && dom.sessionView?.dataset.chatDock === "bottom",
  );
}

function getEmojiViewportSize() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(0, viewport?.width || window.innerWidth || 0),
    height: Math.max(0, viewport?.height || window.innerHeight || 0),
  };
}

function getEmojiPopoverTrack(popover) {
  return popover.querySelector(".emoji-popover-track");
}

function rebuildEmojiPopoverPages(popover, options, columns, rows) {
  const track = getEmojiPopoverTrack(popover);
  if (!track) return;

  const previousPage = track.clientWidth > 0
    ? Math.round(track.scrollLeft / track.clientWidth)
    : 0;
  const pageSize = Math.max(1, columns * rows);
  track.replaceChildren();

  for (let start = 0; start < options.length; start += pageSize) {
    const page = document.createElement("div");
    page.className = "emoji-popover-page";
    page.style.setProperty("--emoji-page-columns", String(columns));
    page.style.setProperty("--emoji-page-rows", String(rows));
    options.slice(start, start + pageSize).forEach((option) => page.append(option));
    track.append(page);
  }

  const nextPage = Math.min(
    Math.max(0, previousPage),
    Math.max(0, track.children.length - 1),
  );
  track.scrollLeft = nextPage * track.clientWidth;
}

function syncEmojiPopoverLayout(popover) {
  const options = [...popover.querySelectorAll(".emoji-option")];
  if (!options.length) return;

  const landscapeKeyboardLayout = isLandscapeKeyboardEmojiLayout();
  const computedStyle = window.getComputedStyle(popover);
  const parsePixels = (value) => Number.parseFloat(value) || 0;
  const verticalChrome = parsePixels(computedStyle.paddingTop)
    + parsePixels(computedStyle.paddingBottom)
    + parsePixels(computedStyle.borderTopWidth)
    + parsePixels(computedStyle.borderBottomWidth);
  const rowGap = parsePixels(computedStyle.rowGap || computedStyle.gap);
  const { width: viewportWidth, height: viewportHeight } = getEmojiViewportSize();
  const availableWidth = Math.max(
    0,
    viewportWidth - EMOJI_POPOVER_EDGE_PX * 2,
  );
  const availableHeight = Math.max(
    0,
    viewportHeight
      - EMOJI_POPOVER_EDGE_PX * 2
      - EMOJI_POPOVER_TAIL_HEIGHT_PX,
  );

  if (landscapeKeyboardLayout) {
    popover.style.width = `${availableWidth}px`;
    popover.style.maxWidth = `${availableWidth}px`;
  } else {
    popover.style.removeProperty("width");
    popover.style.removeProperty("max-width");
  }

  popover.classList.remove("is-emoji-popover-paged");
  popover.style.removeProperty("height");
  rebuildEmojiPopoverPages(
    popover,
    options,
    EMOJI_PAGE_COLUMNS,
    Math.ceil(options.length / EMOJI_PAGE_COLUMNS),
  );

  const naturalHeight = popover.offsetHeight + EMOJI_POPOVER_TAIL_HEIGHT_PX;
  if (naturalHeight <= availableHeight) return;

  const optionRect = options[0].getBoundingClientRect();
  const naturalCellHeight = Math.max(EMOJI_PAGE_MIN_CELL_PX, optionRect.height);
  const rows = Math.max(
    1,
    Math.min(
      EMOJI_PAGE_MAX_ROWS,
      Math.floor(
        (availableHeight - verticalChrome + rowGap)
        / (naturalCellHeight + rowGap),
      ),
    ),
  );

  popover.classList.add("is-emoji-popover-paged");
  const compactHeight = verticalChrome
    + rows * naturalCellHeight
    + rowGap * Math.max(0, rows - 1);
  popover.style.height = `${Math.max(
    EMOJI_PAGE_MIN_CELL_PX + verticalChrome,
    Math.min(availableHeight, compactHeight),
  )}px`;
  rebuildEmojiPopoverPages(popover, options, EMOJI_PAGE_COLUMNS, rows);
}

function positionEmojiPopover(popover, anchor) {
  syncEmojiPopoverLayout(popover);
  const { width: viewportWidth, height: viewportHeight } = getEmojiViewportSize();
  const anchorRect = anchor.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;
  const popoverVisualHeight = popoverHeight + EMOJI_POPOVER_TAIL_HEIGHT_PX;
  const maxLeft = Math.max(
    EMOJI_POPOVER_EDGE_PX,
    viewportWidth - popoverWidth - EMOJI_POPOVER_EDGE_PX,
  );
  const left = Math.min(
    maxLeft,
    Math.max(EMOJI_POPOVER_EDGE_PX, anchorRect.left),
  );
  const spaceAbove = anchorRect.top - EMOJI_POPOVER_GAP_PX;
  const spaceBelow = viewportHeight - anchorRect.bottom - EMOJI_POPOVER_GAP_PX;
  const opensBelow = spaceAbove < popoverVisualHeight && spaceBelow > spaceAbove;
  const maxTop = Math.max(
    EMOJI_POPOVER_EDGE_PX,
    viewportHeight - popoverHeight - EMOJI_POPOVER_EDGE_PX,
  );
  const desiredTop = opensBelow
    ? anchorRect.bottom + EMOJI_POPOVER_GAP_PX + EMOJI_POPOVER_TAIL_HEIGHT_PX
    : anchorRect.top - popoverVisualHeight - EMOJI_POPOVER_GAP_PX;
  const top = Math.min(
    maxTop,
    Math.max(EMOJI_POPOVER_EDGE_PX, desiredTop),
  );
  const pathWidth = Math.max(0, popoverWidth - EMOJI_POPOVER_BORDER_WIDTH_PX);
  const rawAnchorOffset = anchorRect.left
    + anchorRect.width / 2
    - left
    - EMOJI_POPOVER_BORDER_WIDTH_PX / 2;
  const anchorOffset = Math.min(
    Math.max(EMOJI_POPOVER_TAIL_INSET_PX, pathWidth - EMOJI_POPOVER_TAIL_INSET_PX),
    Math.max(
      EMOJI_POPOVER_TAIL_INSET_PX,
      rawAnchorOffset,
    ),
  );

  popover.dataset.placement = opensBelow ? "bottom" : "top";
  popover.style.setProperty("--emoji-popover-anchor-x", `${anchorOffset}px`);
  const surface = popover.parentElement?.matches(".chat-area, .player-frame")
    ? popover.parentElement
    : null;
  if (surface) {
    const surfaceRect = surface.getBoundingClientRect();
    popover.style.position = "absolute";
    popover.style.top = `${top - surfaceRect.top}px`;
    popover.style.left = `${left - surfaceRect.left}px`;
  } else {
    popover.style.removeProperty("position");
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }
}

export function repositionEmojiPicker() {
  const popover = dom.emojiPopover;
  if (!popover || popover.hidden || !popover.dataset.anchor) return;

  const anchor = document.getElementById(popover.dataset.anchor);
  if (!anchor) {
    hideEmojiPicker();
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  if (anchorRect.bottom < 0 || anchorRect.top > window.innerHeight) {
    // En escritorio el picker no debe depender del foco ni del estado
    // transitorio del composer: perder el foco puede sacar el ancla del
    // viewport mientras el layout se acomoda. En móvil conservamos el cierre
    // actual para no alterar el flujo del teclado virtual.
    if (isMobileLayout()) hideEmojiPicker();
    return;
  }

  positionEmojiPopover(popover, anchor);
}

function cancelEmojiPopoverHide() {
  if (!emojiPopoverHideTimer) return;
  window.clearTimeout(emojiPopoverHideTimer);
  emojiPopoverHideTimer = 0;
}

function showEmojiPopover(popover) {
  cancelEmojiPopoverHide();
  const track = getEmojiPopoverTrack(popover);
  if (track) track.scrollLeft = 0;
  popover.hidden = false;
  popover.classList.remove("is-emoji-popover-closing");
  window.requestAnimationFrame(() => {
    if (popover.hidden || popover.classList.contains("is-emoji-popover-closing")) return;
    popover.classList.add("is-emoji-popover-open");
  });
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

export function autoResizeMessageInput(input) {
  const isOverlay = input === dom.overlayMessageInput;
  const messagesContainer = isOverlay ? dom.overlayMessages : dom.messages;
  const wasPinnedToBottom = isPinnedToBottom(messagesContainer);

  const maxHeight = isOverlay ? 86 : 118;
  const mobileMinHeight = window.matchMedia?.(MOBILE_CHAT_LAYOUT_QUERY).matches;
  const minHeight = mobileMinHeight ? 30 : (isOverlay ? 30 : 36);
  const wrapper = input.closest(".input-wrapper");

  input.style.height = `${minHeight}px`;
  // El padding del textarea cambia cuando pasa a multilinea. Resolver el
  // estado antes de la medición final evita calcular la altura con la métrica
  // anterior y producir un salto en el primer Enter.
  const shouldExpand = input.scrollHeight > minHeight + 4;
  if (wrapper) {
    wrapper.dataset.expanded = String(shouldExpand);
  }

  const contentHeight = input.scrollHeight;
  input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
  input.scrollTop = input.scrollHeight;
  syncComposerScrollbar(input);
  queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
}

export function buildEmojiPicker() {
  void preloadEmojiFont();
  emojiPopoverOriginalParent = dom.emojiPopover.parentElement;
  dom.emojiPopover.innerHTML = "";
  const fog = document.createElement("span");
  fog.className = "emoji-popover-fog";
  fog.setAttribute("aria-hidden", "true");
  const track = document.createElement("div");
  track.className = "emoji-popover-track";
  const page = document.createElement("div");
  page.className = "emoji-popover-page";
  page.style.setProperty("--emoji-page-columns", String(EMOJI_PAGE_COLUMNS));
  track.append(page);
  dom.emojiPopover.append(fog);
  dom.emojiPopover.append(track);
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
    page.append(button);
  });
}

export async function toggleEmojiPicker(input, anchor) {
  logMobileInteraction("emoji:toggle-start", input, {
    anchor: anchor?.id || null,
    anchorFocused: document.activeElement === anchor,
    anchorRect: anchor ? (() => { const rect = anchor.getBoundingClientRect(); return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }; })() : null,
  });
  state.ui.activeEmojiInput = input;
  if (!dom.emojiPopover.hidden && dom.emojiPopover.dataset.anchor === anchor.id) {
    hideEmojiPicker();
    logMobileInteraction("emoji:toggle-close", input, { anchor: anchor.id });
    return;
  }

  const selectionStart = input?.selectionStart ?? input?.value.length ?? 0;
  const selectionEnd = input?.selectionEnd ?? input?.value.length ?? 0;
  const openRequestId = ++emojiPickerOpenRequestId;
  await preloadEmojiFont();
  if (openRequestId !== emojiPickerOpenRequestId) return;

  syncFullscreenEmojiPopoverSurface(anchor);
  dom.emojiPopover.dataset.anchor = anchor.id;
  showEmojiPopover(dom.emojiPopover);
  positionEmojiPopover(dom.emojiPopover, anchor);
  logMobileInteraction("emoji:opened-before-focus-restore", input, { anchor: anchor.id });

  syncEmojiTriggerState(anchor);

  window.requestAnimationFrame(() => {
    if (openRequestId !== emojiPickerOpenRequestId || dom.emojiPopover.hidden) return;
    if (isMobileLayout()) return;
    focusChatInput(input, selectionStart, selectionEnd);
    logMobileInteraction("emoji:after-focus-restore", input, { anchor: anchor.id });
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
  const popover = dom.emojiPopover;
  emojiPickerOpenRequestId += 1;
  if (popover.hidden) {
    popover.classList.remove("is-emoji-popover-open", "is-emoji-popover-closing");
    popover.dataset.anchor = "";
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    restoreEmojiPopoverSurface();
    syncEmojiTriggerState();
    return;
  }

  if (popover.classList.contains("is-emoji-popover-closing")) return;
  cancelEmojiPopoverHide();
  popover.classList.remove("is-emoji-popover-open");
  popover.classList.add("is-emoji-popover-closing");
  dom.emojiPopover.dataset.anchor = "";
  syncEmojiTriggerState();
  emojiPopoverHideTimer = window.setTimeout(() => {
    emojiPopoverHideTimer = 0;
    popover.hidden = true;
    popover.classList.remove("is-emoji-popover-closing");
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    restoreEmojiPopoverSurface();
  }, EMOJI_POPOVER_TRANSITION_MS);
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
  const input = state.ui.activeEmojiInput;
  logMobileInteraction("emoji:insert-start", input, { emoji, activeEmojiInput: input.id || null });
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const nextPosition = start + emoji.length;
  if (isMobileLayout()) {
    input.setSelectionRange?.(nextPosition, nextPosition);
  } else {
    focusChatInput(input, nextPosition, nextPosition);
  }
  hideEmojiPicker();
  logMobileInteraction("emoji:insert-after-focus", input, {
    emoji,
    nextPosition,
    inputFocused: document.activeElement === input,
  });
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
    let reserveAnimationFrame = 0;
    let currentMessageReserve = null;

    const setMessageReserve = (value, keepAtBottom) => {
      const nextValue = Math.max(0, value);
      currentMessageReserve = nextValue;
      container.style.setProperty("--chat-message-bottom-reserve", `${nextValue}px`);
      if (keepAtBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    const animateMessageReserve = (targetValue, keepAtBottom, startValueOverride = null) => {
      if (reserveAnimationFrame) {
        window.cancelAnimationFrame(reserveAnimationFrame);
        reserveAnimationFrame = 0;
      }

      const startValue = startValueOverride ?? currentMessageReserve;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (
        startValue == null
        || Math.abs(startValue - targetValue) < 0.5
        || reducedMotion
      ) {
        setMessageReserve(targetValue, keepAtBottom);
        return;
      }

      const startedAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / CHAT_RESERVE_TRANSITION_MS);
        const easedProgress = 1 - ((1 - progress) ** 3);
        const value = startValue + ((targetValue - startValue) * easedProgress);
        setMessageReserve(value, keepAtBottom);
        if (progress < 1) {
          reserveAnimationFrame = window.requestAnimationFrame(tick);
        } else {
          reserveAnimationFrame = 0;
        }
      };
      reserveAnimationFrame = window.requestAnimationFrame(tick);
    };

    const updateReserve = () => {
      const wasPinnedToBottom = isPinnedToBottom(messagesContainer);
      const formRect = form.getBoundingClientRect();
      const reserve = Math.ceil(formRect.height);
      const computedStyle = window.getComputedStyle(form);
      const bottomGap = Math.max(0, Math.round(Number.parseFloat(computedStyle.bottom) || 0));
      const messageGap = form === dom.overlayMessageForm
        ? CHAT_OVERLAY_MESSAGE_BOTTOM_GAP
        : CHAT_MESSAGE_BOTTOM_GAP;
      const messageReserve = reserve + bottomGap + 2 + messageGap;
      if (messagesWrap && inputWrapper) {
        const messagesWrapRect = messagesWrap.getBoundingClientRect();
        const inputRect = inputWrapper.getBoundingClientRect();
        const replyPreviewOffset = Math.max(
          6,
          Math.ceil(formRect.bottom - inputRect.top + 6),
        );
        form.style.setProperty(
          "--reply-preview-offset",
          `${replyPreviewOffset}px`,
        );
        const visualEnd = Math.max(0, Math.round(inputRect.top - messagesWrapRect.top));
        messagesWrap.style.setProperty("--chat-scrollbar-visual-end", `${visualEnd}px`);
        syncChatScrollbar(messagesContainer);
      }
      container.style.setProperty("--chat-composer-reserve", `${reserve}px`);
      const inlineMessageReserve = Number.parseFloat(
        container.style.getPropertyValue("--chat-message-bottom-reserve"),
      );
      animateMessageReserve(
        messageReserve,
        wasPinnedToBottom,
        Number.isFinite(inlineMessageReserve) ? inlineMessageReserve : null,
      );
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
    const syncReplyPreviewReserve = () => {
      if (reserveFrame) {
        window.cancelAnimationFrame(reserveFrame);
        reserveFrame = 0;
      }
      updateReserve();
    };

    floatingComposerObservers.set(form, observer);
    observer.observe(form);
    window.addEventListener("resize", scheduleReserveUpdate, { passive: true });
    window.addEventListener("chat-reply-preview-layout", syncReplyPreviewReserve, { passive: true });
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

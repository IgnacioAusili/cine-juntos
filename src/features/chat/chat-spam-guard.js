import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { MAX_CHARS, withShortcutHint } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { refreshTooltipForTarget } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";

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

let lastMessageSpamKey = "";

let sameMessageCount = 0;

let lastMessageSentAt = 0;

let recentMessageSentAt = [];

let recentImageSentAt = [];

let sentImageFingerprintQueue = [];

let sentImageFingerprintSet = new Set();

let spamCooldownUntil = 0;

let spamCooldownTimer = 0;

function getSendButtons() {
  return [dom.mainMessageSend, dom.overlayMessageSend].filter(Boolean);
}

export function getSpamCooldownRemaining() {
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

export function hashImageFingerprint(image) {
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

export function updateSpamCooldownButtons() {
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

export function registerMessageForSpamCheck(text, attachedImage) {
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

import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { MAX_RENDERED_MESSAGES, formatTime, formatClockTime } from "../../core/utils.js";
import { markParticipantActive, rememberParticipant } from "../presence.js?v=20260824-name-commit-reveal-02";
import { wireMessageInteractions } from "./chat-message-interactions.js";
import { appendMessageContent, truncateText } from "./chat-content-parser.js?v=20260810-chat-fixes-02";
import { getParticipantAccent } from "./chat-participant-color.js";
import { scheduleMessageTimeAdjustmentForBubble } from "./message-time-layout.js?v=20260811-layout-motion-01";
import {
  handleIncomingUnread,
  handleIncomingPageUnread,
  incrementScrollIndicator,
} from "./unread-counters.js";
import { setReplyTarget, scrollToMessage } from "./chat-reply.js?v=20260826-reply-sync-close-03";
import {
  animateExpandedSystemMessageRemoval,
  captureExpandedSystemMessageRemoval,
  prepareSystemMessageRemoval,
  refreshSystemMessageGroup,
  scheduleSystemMessageCollapse,
} from "./system-message-groups.js?v=20260823-system-message-drum-09";

const EMOJI_ONLY_PATTERN = /^(?:[\s\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D\u20E3])+$/u;
const EMOJI_GLYPH_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
const SYSTEM_MESSAGE_STREAK_LIMIT = 10;
const SYSTEM_MESSAGE_EXIT_MS = 380;
const SYSTEM_GROUP_HYDRATION_MAX_MS = 8000;
const messageRenderQueues = new WeakMap();
const systemMessageLayoutObservers = new WeakMap();
const systemMessageLayoutFrames = new WeakMap();

export function beginSystemMessageHydration() {
  finishSystemMessageHydration();
  state.chat.systemGroupAnimationSuppressed = true;
  state.chat.systemGroupAnimationMaxTimer = window.setTimeout(
    finishSystemMessageHydration,
    SYSTEM_GROUP_HYDRATION_MAX_MS,
  );
}

export function finishSystemMessageHydration() {
  if (state.chat.systemGroupAnimationMaxTimer) {
    window.clearTimeout(state.chat.systemGroupAnimationMaxTimer);
    state.chat.systemGroupAnimationMaxTimer = null;
  }
  state.chat.systemGroupAnimationSuppressed = false;
}

/**
 * Renderiza un mensaje en los contenedores de chat.
 */
export function renderMessage(message, options = {}) {
  const requestedSystemGroupAnimation = options.animateSystemGroups
    ?? message?.animateSystemGroups
    ?? (message?.videoEvent?.action === "video-ready" ? false : null)
    ?? true;
  const animateSystemGroups = requestedSystemGroupAnimation
    && !state.chat.systemGroupAnimationSuppressed;
  const messageText = String(message?.text || "").trim();
  const messageImages = getRenderableMessageImages(message, messageText);
  if (
    (!messageText && !message?.image && !messageImages.length) ||
    state.chat.lastMessageIds.has(message.id)
  )
    return;
  state.chat.lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);
  markParticipantActive(message.from, message.name);

  const mainItem = appendMessageTo(dom.messages, message, { animateSystemGroups });
  const overlayItem = appendMessageTo(dom.overlayMessages, message, { animateSystemGroups });

  if (message.from !== state.session.clientId) {
    handleIncomingUnread();
    handleIncomingPageUnread();
  }
  Promise.resolve(mainItem).then((item) => {
    scheduleMessageTimeAdjustmentForBubble(item?.querySelector(".message-bubble"));
  });
  Promise.resolve(overlayItem).then((item) => {
    scheduleMessageTimeAdjustmentForBubble(item?.querySelector(".message-bubble"));
  });
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
}

/**
 * Crea y añade el elemento DOM del mensaje al contenedor.
 */
function appendMessageTo(container, message, options = {}) {
  const previousTask = messageRenderQueues.get(container);
  if (!message.system && !previousTask) return appendMessageNow(container, message, options);

  const task = (previousTask || Promise.resolve())
    .catch(() => null)
    .then(async () => {
      if (message.system) await makeRoomForSystemMessage(container, options);
      return appendMessageNow(container, message, options);
    });
  messageRenderQueues.set(container, task);
  return task;
}

function appendMessageNow(container, message, { animateSystemGroups = true } = {}) {
  const isMine = message.from === state.session.clientId;
  const authorKey = String(message.from || message.name || "").trim();
  const previousMessage = getPreviousRenderableMessage(container);
  const messageText = String(message?.text || "").trim();
  const messageImages = getRenderableMessageImages(message, messageText);
  const isContinuation = Boolean(
    !message.system &&
    !previousMessage?.classList.contains("system") &&
    previousMessage?.dataset.authorId === authorKey,
  );
  const shouldRenderAuthorName = !isContinuation;
  const hasRenderableText = Boolean(messageText) && !isStandaloneImageText(messageText);
  const hasReply = Boolean(
    message.replyTo?.text ||
    message.replyTo?.image ||
    (Array.isArray(message.replyTo?.images) && message.replyTo.images.length),
  );
  const isMediaOnly = !message.system && Boolean(messageImages.length) && !hasReply && !hasRenderableText;
  const item = document.createElement("article");
  item.className = `message${isMine ? " mine" : ""}${message.system ? " system" : ""}`;
  item._chatMessage = message;
  item.dataset.messageId = message.id;
  item.dataset.authorId = authorKey;
  item.style.setProperty("--participant-accent", getParticipantAccent(message.name));

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const metaName = document.createElement("span");
  metaName.className = "message-meta-name";
  metaName.textContent = message.name || "Invitado";

  let tsBtn = null;
  if (message.videoTimestamp != null && !message.system) {
    tsBtn = document.createElement("button");
    tsBtn.type = "button";
    tsBtn.className = "message-video-ts";
    tsBtn.dataset.tooltip = `Ir al minuto ${formatClockTime(message.videoTimestamp)} del video`;
    tsBtn.removeAttribute("title");
    tsBtn.setAttribute("aria-label", `Saltar a ${formatClockTime(message.videoTimestamp)} en el video`);
    tsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="8" height="8" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg><span>${formatClockTime(message.videoTimestamp)}</span>`;
    tsBtn.addEventListener("click", () => {
      if (dom.videoPlayer && Number.isFinite(message.videoTimestamp)) {
        dom.videoPlayer.currentTime = message.videoTimestamp;
      }
    });
  }

  if (isMine) {
    if (tsBtn) meta.append(tsBtn);
    if (shouldRenderAuthorName) meta.append(metaName);
  } else {
    if (shouldRenderAuthorName) meta.append(metaName);
    if (tsBtn) meta.append(tsBtn);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const content = document.createElement("div");
  content.className = "message-content";
  const emojiOnlyCount = countEmojiGlyphs(messageText);
  const isEmojiOnly =
    !message.system &&
    !hasReply &&
    !messageImages.length &&
    isEmojiOnlyText(messageText);
  if (isEmojiOnly) {
    bubble.classList.add("message-bubble--emoji-only");
    if (emojiOnlyCount > 4) bubble.classList.add("message-bubble--emoji-only-compact");
  }
  const replyTextRow = hasReply && !message.system ? document.createElement("div") : null;
  if (hasReply) {
    bubble.classList.add("message-bubble--with-reply");
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "message-reply";
    reply.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(message.replyTo.name),
    );
    const rawReplyLabel = String(message.replyTo.text || "").trim();
    const replyLabel =
      rawReplyLabel && !(rawReplyLabel.startsWith("data:image/") && rawReplyLabel.includes("base64,"))
        ? rawReplyLabel
        : "(Imagen)";
    reply.innerHTML = `<span class="message-reply-name">${message.replyTo.name || "Invitado"}</span><span class="message-reply-body">${truncateText(replyLabel, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id, container));
    content.append(reply);
  }

  if (message.text) {
    if (message.system) {
      bubble.classList.add("message-system-bubble");
      const systemText = document.createElement("span");
      systemText.className = "message-system-text";

      const exactName = String(message.name || "Invitado").trim();
      const rawText = getSystemMessageText(message, isMine);
      if (exactName && rawText.startsWith(exactName)) {
        const bodyText = rawText.slice(exactName.length).trimStart();
        const ownBodyText = isMine ? normalizeOwnSystemBody(bodyText) : "";
        if (ownBodyText) {
          const body = document.createElement("span");
          body.className = "message-system-body";
          body.textContent = ownBodyText;
          systemText.append(body);
        } else {
          const systemName = document.createElement("span");
          systemName.className = "message-system-name";
          systemName.textContent = isMine ? "Tu" : exactName;
          systemText.append(systemName);
          if (bodyText) {
            const body = document.createElement("span");
            body.className = "message-system-body";
            body.textContent = ` ${bodyText}`;
            systemText.append(body);
          }
        }
      } else {
        systemText.textContent = rawText;
      }
      content.append(systemText);
    } else if (hasRenderableText) {
      appendMessageContent(replyTextRow || content, message.text);
    }
  }

  if (replyTextRow) {
    replyTextRow.className = "message-reply-text-row";
    content.append(replyTextRow);
  }

  if (!isMediaOnly) appendMessageMedia(content, messageImages);
  bubble.append(content);
  if (message.system) {
    const bubbleRow = document.createElement("div");
    bubbleRow.className = "message-bubble-row system-message-row";
    const hintWrapper = document.createElement("div");
    hintWrapper.className = "swipe-reply-hint-wrapper";
    const hint = document.createElement("span");
    hint.className = "swipe-reply-hint";
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);
    bubbleRow.append(bubble, hintWrapper);
    item.append(bubbleRow);

    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget,
      replyInput: container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput,
      interactionTarget: item,
      interactionBand: bubbleRow,
    });
  } else if (isMediaOnly) {
    item.classList.add("message--media-only");
    const mediaRow = document.createElement("div");
    mediaRow.className = "message-media-row";
    const hintWrapper = document.createElement("div");
    hintWrapper.className = "swipe-reply-hint-wrapper";
    const hint = document.createElement("span");
    hint.className = "swipe-reply-hint";
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);

    const mediaStrip = appendMessageMedia(mediaRow, messageImages, true);
    mediaRow.append(hintWrapper);
    if (shouldRenderAuthorName || tsBtn) item.append(meta);
    item.append(mediaRow);

    const timeAnchor = document.createElement("div");
    timeAnchor.className = "message-time-anchor";
    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatTime(message.createdAt);
    timeAnchor.append(time);
    item.append(timeAnchor);

    const replyInput = container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput;
    wireMessageInteractions(mediaStrip || mediaRow, message, hint, {
      setReplyTarget,
      replyInput,
      interactionTarget: item,
      interactionBand: mediaRow,
      interactionBands: [meta],
      allowSwipeInsideBubble: true,
    });
  } else {
    const timeAnchor = document.createElement("div");
    timeAnchor.className = "message-time-anchor";

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatTime(message.createdAt);
    timeAnchor.append(time);

    if (replyTextRow) {
      replyTextRow.prepend(timeAnchor);
    } else {
      bubble.insertBefore(timeAnchor, content);
    }

    const bubbleRow = document.createElement("div");
    bubbleRow.className = "message-bubble-row";

    const hintWrapper = document.createElement("div");
    hintWrapper.className = "swipe-reply-hint-wrapper";
    const hint = document.createElement("span");
    hint.className = "swipe-reply-hint";
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);

    bubbleRow.append(bubble, hintWrapper);
    if (shouldRenderAuthorName || tsBtn) item.append(meta);
    item.append(bubbleRow);

    const replyInput = container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput;
    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget,
      replyInput,
      companions: [meta],
      interactionTarget: item,
      interactionBand: bubbleRow,
      interactionBands: [meta],
    });
  }
  container.append(item);
  if (message.system) {
    watchSystemMessageLayout(container);
    fitSystemMessageBubble(item);
  }
  trimRenderedMessages(container);
  scheduleSystemMessageCollapse(container, {
    animateIncoming: Boolean(message.system) && animateSystemGroups,
  });

  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromBottom <= threshold || message.from === state.session.clientId) {
    container.scrollTop = container.scrollHeight;
  } else if (message.from !== state.session.clientId) {
    incrementScrollIndicator(isOverlay);
  }

  return item;
}

function watchSystemMessageLayout(container) {
  if (!container || systemMessageLayoutObservers.has(container) || !window.ResizeObserver) return;

  const observer = new ResizeObserver(() => {
    if (systemMessageLayoutFrames.has(container)) return;

    const frame = window.requestAnimationFrame(() => {
      systemMessageLayoutFrames.delete(container);
      container
        .querySelectorAll(".message.system .message-system-bubble")
        .forEach(fitSystemMessageBubble);
    });
    systemMessageLayoutFrames.set(container, frame);
  });

  observer.observe(container);
  systemMessageLayoutObservers.set(container, observer);
}

function fitSystemMessageBubble(itemOrBubble) {
  const bubble = itemOrBubble?.matches?.(".message-system-bubble")
    ? itemOrBubble
    : itemOrBubble?.querySelector?.(".message-system-bubble");
  const text = bubble?.querySelector(".message-system-text");
  if (
    !bubble ||
    !text ||
    text.classList.contains("system-message-roll-viewport") ||
    bubble.getBoundingClientRect().width <= 0
  ) return;

  bubble.style.removeProperty("width");
  const naturalWidth = bubble.getBoundingClientRect().width;
  if (!naturalWidth) return;

  let fittedWidth = naturalWidth;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) setSystemBubbleWidth(bubble, fittedWidth);

    const longestLineWidth = getLongestRenderedLineWidth(text);
    if (!Number.isFinite(longestLineWidth)) {
      bubble.style.removeProperty("width");
      return;
    }

    const bubbleStyle = getComputedStyle(bubble);
    const beforeWidth = Number.parseFloat(getComputedStyle(bubble, "::before").width) || 0;
    const afterWidth = Number.parseFloat(getComputedStyle(bubble, "::after").width) || 0;
    const gap = Number.parseFloat(bubbleStyle.columnGap || bubbleStyle.gap) || 0;
    const nextWidth = Math.min(
      naturalWidth,
      longestLineWidth + beforeWidth + afterWidth + gap * 2 + getHorizontalBoxExtras(bubbleStyle),
    );

    if (Math.abs(nextWidth - fittedWidth) < 0.5) {
      fittedWidth = nextWidth;
      break;
    }
    fittedWidth = nextWidth;
  }

  if (fittedWidth >= naturalWidth - 0.5) bubble.style.removeProperty("width");
  else setSystemBubbleWidth(bubble, fittedWidth);
}

function getLongestRenderedLineWidth(text) {
  const range = document.createRange();
  range.selectNodeContents(text);
  const lines = [];

  [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .forEach((rect) => {
      const line = lines.find((candidate) => Math.abs(candidate.top - rect.top) < 0.5);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
        return;
      }
      lines.push({ top: rect.top, left: rect.left, right: rect.right });
    });

  if (!lines.length) return Number.NaN;
  return Math.max(...lines.map(({ left, right }) => right - left));
}

function getHorizontalBoxExtras(style) {
  return [
    style.paddingLeft,
    style.paddingRight,
    style.borderLeftWidth,
    style.borderRightWidth,
  ].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
}

function setSystemBubbleWidth(bubble, outerWidth) {
  const style = getComputedStyle(bubble);
  const boxExtras = getHorizontalBoxExtras(style);
  const cssWidth = style.boxSizing === "border-box"
    ? outerWidth
    : Math.max(0, outerWidth - boxExtras);
  bubble.style.width = `${cssWidth}px`;
}

function getPreviousRenderableMessage(container) {
  const children = Array.from(container.children);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (!child.classList.contains("message")) continue;
    if (child.classList.contains("system-group-collapsed-item")) continue;
    return child;
  }
  return null;
}

function getSystemMessageText(message, isMine) {
  const videoEvent = message.videoEvent;
  if (videoEvent?.action === "video-ready" && videoEvent.isReload) {
    return isMine
      ? "Se te ha recargado el video"
      : `${String(message.name || "Invitado").trim()} le ha recargado el video`;
  }
  return String(message.text || "").trim();
}

function normalizeOwnSystemBody(bodyText) {
  if (/^tiene inconvenientes en el video\b/i.test(bodyText)) {
    return bodyText.replace(/^tiene\b/i, "Tienes");
  }

  const rules = [
    [/^inició el video$/i, "Iniciaste el video"],
    [/^ingresó un video$/i, "Ingresaste un video"],
    [/^reprodujo el video en (.+)$/i, "Reprodujiste el video en $1"],
    [/^pausó el video en (.+)$/i, "Pausaste el video en $1"],
    [/^saltó a (.+)$/i, "Saltaste a $1"],
    [/^cambió la velocidad a (.+)$/i, "Cambiaste la velocidad a $1"],
    [/^le ha cargado el video$/i, "Se te ha cargado el video"],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(bodyText)) {
      return bodyText.replace(pattern, replacement);
    }
  }

  return "";
}

function isEmojiOnlyText(text) {
  const value = String(text || "").trim();
  return Boolean(value) && EMOJI_GLYPH_PATTERN.test(value) && EMOJI_ONLY_PATTERN.test(value);
}

function countEmojiGlyphs(text) {
  const value = String(text || "").trim();
  if (!value) return 0;

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].filter(({ segment }) => EMOJI_GLYPH_PATTERN.test(segment)).length;
  }

  return [...value].filter((character) => EMOJI_GLYPH_PATTERN.test(character)).length;
}

/**
 * Limita la cantidad de mensajes renderizados para optimizar el rendimiento.
 */
function trimRenderedMessages(container) {
  const messageChildren = () => Array.from(container.children).filter((child) => child.classList.contains("message"));
  while (messageChildren().length > MAX_RENDERED_MESSAGES) {
    const oldest = messageChildren()[0];
    if (!oldest) break;
    const groupHeader = prepareSystemMessageRemoval(container, oldest);
    oldest.remove();
    refreshSystemMessageGroup(groupHeader);
    scheduleSystemMessageCollapse(container);
  }
}

function getTrailingSystemStreak(container) {
  const children = Array.from(container.children).filter((child) => child.classList.contains("message"));
  let streakStart = children.length;

  while (streakStart > 0 && children[streakStart - 1].classList.contains("system")) {
    streakStart -= 1;
  }

  return children.slice(streakStart);
}

async function makeRoomForSystemMessage(container, { animateSystemGroups = true } = {}) {
  while (getTrailingSystemStreak(container).length >= SYSTEM_MESSAGE_STREAK_LIMIT) {
    await removeOldestSystemMessage(container, { animateSystemGroups });
  }
}

function removeOldestSystemMessage(container, { animateSystemGroups = true } = {}) {
  const streak = getTrailingSystemStreak(container);
  const oldest = streak[0];
  if (!oldest) return Promise.resolve();

  const wasNearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight <= 120;
  const groupHeader = prepareSystemMessageRemoval(container, oldest, { deferReanchor: true });
  const expandedRemoval = groupHeader?.getAttribute("aria-expanded") === "true";

  if (!animateSystemGroups) {
    prepareSystemMessageRemoval(container, oldest);
    oldest.remove();
    refreshSystemMessageGroup(groupHeader);
    scheduleSystemMessageCollapse(container);
    if (wasNearBottom) container.scrollTop = container.scrollHeight;
    return Promise.resolve();
  }

  oldest.classList.add("message-system-exit");
  if (expandedRemoval) oldest.classList.add("message-system-exit-expanded");

  return new Promise((resolve) => {
    let removalFinished = false;
    const exitTarget = expandedRemoval
      ? oldest.querySelector(".message-system-bubble")
      : null;
    let fallbackTimer = 0;

    const finishRemoval = () => {
      if (removalFinished) return;
      removalFinished = true;
      if (exitTarget) exitTarget.removeEventListener("animationend", handleExitAnimationEnd);
      window.clearTimeout(fallbackTimer);

      // Reanclar y retirar en la misma tarea evita que el selector se pinte
      // una fila más abajo antes de que el resto del grupo suba.
      prepareSystemMessageRemoval(container, oldest);
      const removalVisualState = expandedRemoval
        ? captureExpandedSystemMessageRemoval(oldest, groupHeader)
        : null;
      oldest.remove();
      refreshSystemMessageGroup(groupHeader);
      scheduleSystemMessageCollapse(container);
      animateExpandedSystemMessageRemoval(removalVisualState);
      if (wasNearBottom) container.scrollTop = container.scrollHeight;
      window.requestAnimationFrame(resolve);
    };

    const handleExitAnimationEnd = (event) => {
      if (event.animationName !== "systemMessageExitExpandedBubble") return;
      finishRemoval();
    };

    if (exitTarget) {
      exitTarget.addEventListener("animationend", handleExitAnimationEnd);
      fallbackTimer = window.setTimeout(finishRemoval, SYSTEM_MESSAGE_EXIT_MS + 50);
    } else {
      fallbackTimer = window.setTimeout(finishRemoval, SYSTEM_MESSAGE_EXIT_MS);
    }
  });
}

function getRenderableMessageImages(message, messageText = "") {
  const images = Array.isArray(message?.images)
    ? message.images.filter(Boolean)
    : message?.image
      ? [message.image]
      : [];
  if (images.length) return images;
  if (isStandaloneImageText(messageText)) return [messageText.trim()];
  return [];
}

function isStandaloneImageText(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("data:image/") && trimmed.includes("base64,");
}

function appendMessageMedia(container, images, isStandalone = false) {
  if (!container || !Array.isArray(images) || !images.length) return null;
  const strip = document.createElement("div");
  strip.className = "message-media-strip";
  if (isStandalone) strip.classList.add("message-media-strip--standalone");

  for (const imageUrl of images.slice(0, 2)) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = imageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";

    const imgElement = document.createElement("img");
    imgElement.className = "message-media";
    imgElement.src = imageUrl;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    strip.append(link);
  }

  container.append(strip);
  return strip;
}

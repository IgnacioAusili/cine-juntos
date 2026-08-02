import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { MAX_RENDERED_MESSAGES, formatTime, formatClockTime } from "../../core/utils.js";
import { markParticipantActive, rememberParticipant } from "../presence.js";
import { wireMessageInteractions } from "./chat-message-interactions.js";
import { appendMessageContent, truncateText } from "./chat-content-parser.js?v=20260801-01";
import { getParticipantAccent } from "./chat-participant-color.js";
import { scheduleMessageTimeAdjustmentForBubble } from "./message-time-layout.js?v=20260802-02";
import {
  handleIncomingUnread,
  handleIncomingPageUnread,
  incrementScrollIndicator,
} from "./unread-counters.js";
import { setReplyTarget, scrollToMessage } from "./chat-reply.js";

const EMOJI_ONLY_PATTERN = /^(?:[\s\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D\u20E3]|[0-9#*]\uFE0F?\u20E3)+$/u;
const EMOJI_GLYPH_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]|[0-9#*]\uFE0F?\u20E3/u;

/**
 * Renderiza un mensaje en los contenedores de chat.
 */
export function renderMessage(message) {
  const messageImages = Array.isArray(message?.images) ? message.images : [];
  if (
    (!message?.text && !message?.image && !messageImages.length) ||
    state.chat.lastMessageIds.has(message.id)
  )
    return;
  state.chat.lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);
  markParticipantActive(message.from, message.name);

  const mainItem = appendMessageTo(dom.messages, message);
  const overlayItem = appendMessageTo(dom.overlayMessages, message);

  if (message.from !== state.session.clientId) {
    handleIncomingUnread();
    handleIncomingPageUnread();
  }
  scheduleMessageTimeAdjustmentForBubble(mainItem?.querySelector(".message-bubble"));
  scheduleMessageTimeAdjustmentForBubble(overlayItem?.querySelector(".message-bubble"));
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
}

/**
 * Crea y añade el elemento DOM del mensaje al contenedor.
 */
function appendMessageTo(container, message) {
  const isMine = message.from === state.session.clientId;
  const messageImages = Array.isArray(message?.images) ? message.images : [];
  const item = document.createElement("article");
  item.className = `message${isMine ? " mine" : ""}${message.system ? " system" : ""}`;
  item.dataset.messageId = message.id;
  item.style.setProperty("--participant-accent", getParticipantAccent(message.from || message.name));

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
    tsBtn.title = `Ir al minuto ${formatClockTime(message.videoTimestamp)} del video`;
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
    meta.append(metaName);
  } else {
    meta.append(metaName);
    if (tsBtn) meta.append(tsBtn);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const content = document.createElement("div");
  content.className = "message-content";
  const hasReply = Boolean(message.replyTo?.text);
  const emojiOnlyCount = countEmojiGlyphs(message.text);
  const isEmojiOnly =
    !message.system &&
    !hasReply &&
    !message.image &&
    !messageImages.length &&
    isEmojiOnlyText(message.text);
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
      getParticipantAccent(message.replyTo.from || message.replyTo.id || message.replyTo.name),
    );
    reply.innerHTML = `<span class="message-reply-name">${message.replyTo.name || "Invitado"}</span><span class="message-reply-body">${truncateText(message.replyTo.text, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id, container));
    content.append(reply);
  }

  if (message.text) {
    if (message.system) {
      bubble.classList.add("message-system-bubble");
      const systemText = document.createElement("span");
      systemText.className = "message-system-text";

      const exactName = String(message.name || "Invitado").trim();
      const rawText = String(message.text || "").trim();
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
    } else {
      appendMessageContent(replyTextRow || content, message.text);
    }
  }

  if (replyTextRow) {
    replyTextRow.className = "message-reply-text-row";
    content.append(replyTextRow);
  }

  appendMessageMedia(content, message);
  bubble.append(content);

  if (message.system) {
    item.append(meta, bubble);
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
    item.append(meta, bubbleRow);

    const replyInput = container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput;
    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget,
      replyInput,
      companions: [meta],
    });
  }
  container.append(item);
  trimRenderedMessages(container);

  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (
    distanceFromBottom <= threshold ||
    message.from === state.session.clientId
  ) {
    container.scrollTop = container.scrollHeight;
  } else if (message.from !== state.session.clientId) {
    incrementScrollIndicator(isOverlay);
  }

  return item;
}

function normalizeOwnSystemBody(bodyText) {
  if (/^tiene inconvenientes en el video\b/i.test(bodyText)) {
    return bodyText.replace(/^tiene\b/i, "Tienes");
  }

  const rules = [
    [/^inició el video$/i, "Iniciaste el video"],
    [/^reprodujo el video en (.+)$/i, "Reprodujiste el video en $1"],
    [/^pausó el video en (.+)$/i, "Pausaste el video en $1"],
    [/^saltó a (.+)$/i, "Saltaste a $1"],
    [/^cambió la velocidad a (.+)$/i, "Cambiaste la velocidad a $1"],
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
  while (container.children.length > MAX_RENDERED_MESSAGES) {
    container.firstElementChild?.remove();
  }
}

function appendMessageMedia(container, message) {
  const images = Array.isArray(message.images)
    ? message.images.filter(Boolean)
    : message.image
      ? [message.image]
      : [];

  if (!images.length) return;

  const strip = document.createElement("div");
  strip.className = "message-media-strip";

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
}

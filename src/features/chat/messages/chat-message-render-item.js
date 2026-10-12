import { dom } from "../../../core/dom.js";
import { state } from "../../../core/state.js";
import { formatTime, formatClockTime } from "../../../core/utils.js";
import { getPreviousRenderableMessage, getFirstRenderableMessage, removeContinuationAuthorName } from "./chat-message-flow.js";
import { getSystemMessageText, normalizeOwnSystemBody, isEmojiOnlyText, countEmojiGlyphs } from "../system-messages/chat-system-message-text.js";
import { getRenderableMessageImages, isStandaloneImageText, appendMessageMedia } from "./chat-message-media.js";
import { extendMessageHitArea, wireMessageInteractions } from "./chat-message-interactions.js";
import { appendMessageContent, truncateText } from "./chat-content-parser.js";
import { getParticipantAccent } from "./chat-participant-color.js";
import { setReplyTarget, scrollToMessage } from "./chat-reply.js";
import { watchSystemMessageLayout, fitSystemMessageBubble } from "../system-messages/chat-system-message-layout.js";
import { incrementScrollIndicator } from "./unread-counters.js";
import { scheduleSystemMessageCollapse } from "../system-messages/system-message-groups.js";

export function appendMessageNow(container, message, { animateSystemGroups = true, prepend = false } = {}) {
  const isMine = message.from === state.session.clientId;
  // Un lector en el borde superior de una lista scrolleable no está siguiendo
  // los mensajes nuevos, aunque el contenido esté a menos de 120 px del final.
  const wasReadingFromTop = !prepend
    && container.scrollTop <= 1
    && container.scrollHeight > container.clientHeight + 1;
  const authorKey = String(message.from || message.name || "").trim();
  const previousMessage = prepend
    ? getFirstRenderableMessage(container)
    : getPreviousRenderableMessage(container);
  const messageText = String(message?.text || "").trim();
  const messageImages = getRenderableMessageImages(message, messageText);
  const isContinuation = Boolean(
    !message.system &&
    !previousMessage?.classList.contains('message--system') &&
    previousMessage?.dataset.authorId === authorKey,
  );
  const shouldRenderAuthorName = prepend || !isContinuation;
  const hasRenderableText = Boolean(messageText) && !isStandaloneImageText(messageText);
  const hasReply = Boolean(
    message.replyTo?.text ||
    message.replyTo?.image ||
    (Array.isArray(message.replyTo?.images) && message.replyTo.images.length),
  );
  const isMediaOnly = !message.system && Boolean(messageImages.length) && !hasReply && !hasRenderableText;
  const item = document.createElement("article");
  item.className = `message${isMine ? ' message--mine' : ""}${message.system ? ' message--system' : ""}`;
  item._chatMessage = message;
  item.dataset.messageId = message.id;
  item.dataset.authorId = authorKey;
  item.style.setProperty("--participant-accent", getParticipantAccent(message.name));
  extendMessageHitArea(item, container);

  const meta = document.createElement("div");
  meta.className = 'message__meta';

  const metaName = document.createElement("span");
  metaName.className = 'message__meta-name';
  metaName.textContent = message.name || "Invitado";

  let tsBtn = null;
  if (message.videoTimestamp != null && !message.system) {
    tsBtn = document.createElement("button");
    tsBtn.type = "button";
    tsBtn.className = 'message__video-ts';
    tsBtn.dataset.tooltip = `Ir al minuto ${formatClockTime(message.videoTimestamp)} del video`;
    tsBtn.removeAttribute("title");
    tsBtn.setAttribute("aria-label", `Saltar a ${formatClockTime(message.videoTimestamp)} en el video`);
    tsBtn.innerHTML = `<span class="message-video-ts__visual"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="8" height="8" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg><span class="message-video-ts__time">${formatClockTime(message.videoTimestamp)}</span></span>`;
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
  bubble.className = 'message__bubble';
  const content = document.createElement("div");
  content.className = 'message__content';
  const emojiOnlyCount = countEmojiGlyphs(messageText);
  const isEmojiOnly =
    !message.system &&
    !hasReply &&
    !messageImages.length &&
    isEmojiOnlyText(messageText);
  if (isEmojiOnly) {
    bubble.classList.add('message__bubble--emoji-only');
    if (emojiOnlyCount > 4) bubble.classList.add('message__bubble--emoji-only-compact');
  }
  const replyTextRow = hasReply && !message.system ? document.createElement("div") : null;
  if (hasReply) {
    bubble.classList.add('message__bubble--with-reply');
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = 'message__reply';
    reply.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(message.replyTo.name),
    );
    const rawReplyLabel = String(message.replyTo.text || "").trim();
    const replyLabel =
      rawReplyLabel && !(rawReplyLabel.startsWith("data:image/") && rawReplyLabel.includes("base64,"))
        ? rawReplyLabel
        : "(Imagen)";
    reply.innerHTML = `<span class="message__reply-name">${message.replyTo.name || "Invitado"}</span><span class="message__reply-body">${truncateText(replyLabel, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id, container));
    content.append(reply);
  }

  if (message.text) {
    if (message.system) {
      bubble.classList.add('message__system-bubble');
      const systemText = document.createElement("span");
      systemText.className = 'message__system-text';

      const exactName = String(message.name || "Invitado").trim();
      const rawText = getSystemMessageText(message, isMine);
      if (exactName && rawText.startsWith(exactName)) {
        const bodyText = rawText.slice(exactName.length).trimStart();
        const ownBodyText = isMine ? normalizeOwnSystemBody(bodyText) : "";
        if (ownBodyText) {
          const body = document.createElement("span");
          body.className = 'message__system-body';
          body.textContent = ownBodyText;
          systemText.append(body);
        } else {
          const systemName = document.createElement("span");
          systemName.className = 'message__system-name';
          systemName.textContent = isMine ? "Tu" : exactName;
          systemText.append(systemName);
          if (bodyText) {
            const body = document.createElement("span");
            body.className = 'message__system-body';
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
    replyTextRow.className = 'message__reply-text-row';
    content.append(replyTextRow);
  }

  if (!isMediaOnly) appendMessageMedia(content, messageImages);
  if (message.system) {
    const lineBefore = document.createElement("span");
    lineBefore.className = 'message__system-line message__system-line--before';
    lineBefore.setAttribute("aria-hidden", "true");
    const lineAfter = document.createElement("span");
    lineAfter.className = 'message__system-line message__system-line--after';
    lineAfter.setAttribute("aria-hidden", "true");
    bubble.append(lineBefore, content, lineAfter);
  } else {
    bubble.append(content);
  }
  if (message.system) {
    const bubbleRow = document.createElement("div");
    bubbleRow.className = 'message__bubble-row message__system-row';
    const hintWrapper = document.createElement("div");
    hintWrapper.className = 'message__swipe-reply-hint-wrapper';
    const hint = document.createElement("span");
    hint.className = 'message__swipe-reply-hint';
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);
    bubbleRow.append(bubble, hintWrapper);
    item.append(bubbleRow);

    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget,
      replyInput: container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput,
      interactionTarget: item,
      interactionBand: item,
      allowSwipeInsideBubble: true,
    });
  } else if (isMediaOnly) {
    item.classList.add("message--media-only");
    const mediaRow = document.createElement("div");
    mediaRow.className = 'message__media-row';
    const hintWrapper = document.createElement("div");
    hintWrapper.className = 'message__swipe-reply-hint-wrapper';
    const hint = document.createElement("span");
    hint.className = 'message__swipe-reply-hint';
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);

    const mediaStrip = appendMessageMedia(mediaRow, messageImages, true);
    mediaRow.append(hintWrapper);
    if (shouldRenderAuthorName || tsBtn) item.append(meta);
    item.append(mediaRow);

    const timeAnchor = document.createElement("div");
    timeAnchor.className = 'message__time-anchor';
    const time = document.createElement("div");
    time.className = 'message__time';
    time.textContent = formatTime(message.createdAt);
    timeAnchor.append(time);
    item.append(timeAnchor);

    const replyInput = container === dom.overlayMessages ? dom.overlayMessageInput : dom.messageInput;
    wireMessageInteractions(mediaStrip || mediaRow, message, hint, {
      setReplyTarget,
      replyInput,
      companions: [meta, timeAnchor],
      interactionTarget: item,
      interactionBand: item,
      allowSwipeInsideBubble: true,
    });
  } else {
    const timeAnchor = document.createElement("div");
    timeAnchor.className = 'message__time-anchor';

    const time = document.createElement("div");
    time.className = 'message__time';
    time.textContent = formatTime(message.createdAt);
    timeAnchor.append(time);

    if (replyTextRow) {
      replyTextRow.prepend(timeAnchor);
    } else {
      bubble.insertBefore(timeAnchor, content);
    }

    const bubbleRow = document.createElement("div");
    bubbleRow.className = 'message__bubble-row';

    const hintWrapper = document.createElement("div");
    hintWrapper.className = 'message__swipe-reply-hint-wrapper';
    const hint = document.createElement("span");
    hint.className = 'message__swipe-reply-hint';
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
      interactionBand: item,
      allowSwipeInsideBubble: true,
    });
  }
  if (prepend) {
    container.prepend(item);
    if (isContinuation) removeContinuationAuthorName(previousMessage);
  } else {
    container.append(item);
  }
  if (message.system) {
    watchSystemMessageLayout(container);
    fitSystemMessageBubble(item);
  }
  scheduleSystemMessageCollapse(container, {
    animateIncoming: Boolean(message.system) && animateSystemGroups,
  });

  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (
    !prepend &&
    !document.hidden &&
    (message.from === state.session.clientId || (!wasReadingFromTop && distanceFromBottom <= threshold))
  ) {
    container.scrollTop = container.scrollHeight;
  } else if (!prepend && message.from !== state.session.clientId) {
    incrementScrollIndicator(isOverlay);
  }

  return item;
}

import { dom } from "../../core/dom.js";

const TIME_GAP_PX = 8;
const STANDALONE_TIME_GAP_PX = 3;
const LINE_TOLERANCE_PX = 1;

let scheduledFrame = 0;
const observerRecords = new WeakMap();

export function scheduleMessageTimeAdjustment() {
  if (scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    adjustMessageTimes();
  });
}

export function scheduleMessageTimeAdjustmentForBubble(bubble) {
  if (!bubble) return;
  observeMessageTimeBubble(bubble);
  window.requestAnimationFrame(() => {
    if (!bubble.isConnected) return;
    const container = bubble.closest(".messages, .overlay-messages");
    if (!isMessageBubbleVisible(bubble, container)) return;
    adjustMessageTimeForBubble(bubble);
  });
}

export function adjustMessageTimes() {
  for (const container of [dom.messages, dom.overlayMessages]) {
    const record = ensureMessageTimeObserver(container);
    if (!record || !isMessageContainerReady(container)) continue;

    if (!record.observer) {
      container.querySelectorAll(".message-bubble").forEach((bubble) => {
        if (isMessageBubbleVisible(bubble, container)) adjustMessageTimeForBubble(bubble);
      });
      continue;
    }

    for (const bubble of record.visibleBubbles) {
      if (bubble.isConnected) {
        adjustMessageTimeForBubble(bubble);
      } else {
        record.visibleBubbles.delete(bubble);
        record.observer.unobserve(bubble);
      }
    }
  }
}

function observeMessageTimeBubble(bubble) {
  const container = bubble.closest(".messages, .overlay-messages");
  const record = ensureMessageTimeObserver(container);
  record?.observer?.observe(bubble);
}

function ensureMessageTimeObserver(container) {
  if (!container) return null;
  const existing = observerRecords.get(container);
  if (existing) return existing;

  const record = { visibleBubbles: new Set(), observer: null };
  if (typeof IntersectionObserver !== "function") {
    observerRecords.set(container, record);
    return record;
  }

  record.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          record.visibleBubbles.add(entry.target);
          scheduleMessageTimeAdjustmentForBubble(entry.target);
        } else {
          record.visibleBubbles.delete(entry.target);
        }
      }
    },
    { root: container, threshold: [0, 0.01] },
  );
  observerRecords.set(container, record);
  container.querySelectorAll(".message-bubble").forEach((bubble) => record.observer.observe(bubble));
  return record;
}

function isMessageContainerReady(container) {
  if (!container) return false;
  const rect = container.getBoundingClientRect();
  return rect.width >= 32 && rect.height > 0;
}

function isMessageBubbleVisible(bubble, container) {
  if (!isMessageContainerReady(container)) return false;
  const bubbleRect = bubble.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (
    bubbleRect.width > 0 &&
    bubbleRect.height > 0 &&
    bubbleRect.right > containerRect.left &&
    bubbleRect.left < containerRect.right &&
    bubbleRect.bottom > containerRect.top &&
    bubbleRect.top < containerRect.bottom
  );
}

export function adjustMessageTimeForBubble(bubble) {
  if (!bubble) return;
  const messageBubble = bubble.matches?.(".message-bubble")
    ? bubble
    : bubble.querySelector(".message-bubble");
  if (!messageBubble) return;

  const timeAnchor = messageBubble.querySelector(".message-time-anchor");
  if (!timeAnchor) return;

  const text = messageBubble.querySelector(".message-text");
  const content = messageBubble.querySelector(".message-content");
  const hasReply = Boolean(content?.querySelector(".message-reply"));
  const textRow = messageBubble.querySelector(".message-reply-text-row");
  const hasMediaContent = Boolean(
    content?.querySelector(".message-media, .message-video, .message-media-link"),
  );
  const isEmojiOnly = messageBubble.classList.contains("message-bubble--emoji-only");

  // Los emojis tienen la hora en una tarjeta independiente debajo del glyph.
  // No deben recibir el layout de floats usado por mensajes de texto.
  if (isEmojiOnly) {
    resetStandaloneTimeLayout(messageBubble, content, timeAnchor);
    resetMessageTimeLayout(timeAnchor);
    restoreOriginalText(text);
    return;
  }

  const layoutKey = getMessageTimeLayoutKey(messageBubble, timeAnchor, text);
  if (timeAnchor.dataset.layoutKey === layoutKey) return;

  resetStandaloneTimeLayout(messageBubble, content, timeAnchor);
  resetMessageTimeLayout(timeAnchor);
  restoreOriginalText(text);

  const lineHeight = getBubbleLineHeight(messageBubble);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

  if (hasReply && textRow) {
    stabilizeFloatLayout(textRow, timeAnchor, lineHeight);
  } else if (text && !hasMediaContent) {
    stabilizeFloatLayout(text, timeAnchor, lineHeight);
    if (!timeFitsLastTextLine(text, timeAnchor)) {
      // No forzar un <br> para hacer lugar a la hora: eso deja huecos al
      // final de la línea anterior. Se conserva el wrapping natural y solo
      // la hora pasa a su propia franja inferior.
      applyStandaloneTimeLayout(messageBubble, content, timeAnchor);
    }
  } else {
    applyFloatLayout(timeAnchor, lineHeight, "100%");
  }

  timeAnchor.dataset.layoutKey = getMessageTimeLayoutKey(messageBubble, timeAnchor, text);
}

function getMessageTimeLayoutKey(bubble, timeAnchor, text) {
  const bubbleRect = bubble.getBoundingClientRect();
  const textRect = text?.getBoundingClientRect();
  const timeRect = timeAnchor.querySelector(".message-time")?.getBoundingClientRect();
  const style = window.getComputedStyle(bubble);

  return [
    bubbleRect.width,
    textRect?.width ?? 0,
    textRect?.height ?? 0,
    timeRect?.width ?? 0,
    style.fontSize,
    style.lineHeight,
  ].join("|");
}

function resetStandaloneTimeLayout(bubble, content, timeAnchor) {
  bubble.style.removeProperty("display");
  bubble.style.removeProperty("flex-direction");
  content?.style.removeProperty("display");
  content?.style.removeProperty("width");
  content?.style.removeProperty("order");
  timeAnchor.style.removeProperty("order");
  timeAnchor.style.removeProperty("justify-content");
  timeAnchor.style.removeProperty("align-items");
}

function applyStandaloneTimeLayout(bubble, content, timeAnchor) {
  bubble.style.display = "flex";
  bubble.style.flexDirection = "column";
  content.style.display = "block";
  content.style.width = "100%";
  content.style.order = "0";
  timeAnchor.style.float = "none";
  timeAnchor.style.order = "1";
  timeAnchor.style.display = "flex";
  timeAnchor.style.width = "100%";
  timeAnchor.style.height = "auto";
  timeAnchor.style.marginLeft = "0";
  timeAnchor.style.marginTop = `${STANDALONE_TIME_GAP_PX}px`;
  timeAnchor.style.shapeOutside = "none";
  timeAnchor.style.justifyContent = "flex-end";
  timeAnchor.style.alignItems = "flex-start";
}

function resetMessageTimeLayout(timeAnchor) {
  timeAnchor.style.removeProperty("float");
  timeAnchor.style.removeProperty("height");
  timeAnchor.style.removeProperty("margin-left");
  timeAnchor.style.removeProperty("margin-top");
  timeAnchor.style.removeProperty("width");
  timeAnchor.style.removeProperty("shape-outside");
  timeAnchor.style.removeProperty("order");
  timeAnchor.style.removeProperty("display");
  timeAnchor.style.removeProperty("visibility");
  timeAnchor.style.removeProperty("transform");
  timeAnchor.querySelector(".message-time")?.style.removeProperty("transform");
}

function getBubbleLineHeight(bubble) {
  const computedStyle = window.getComputedStyle(bubble);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;

  const fontSize = Number.parseFloat(computedStyle.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.2 : 0;
}

function applyFloatLayout(timeAnchor, lineHeight, height) {
  timeAnchor.style.float = "right";
  timeAnchor.style.height = height;
  timeAnchor.style.removeProperty("width");
  timeAnchor.style.marginLeft = `${TIME_GAP_PX}px`;
  timeAnchor.style.shapeOutside = `inset(calc(100% - ${lineHeight}px) 0 0)`;
}

function stabilizeFloatLayout(target, timeAnchor, lineHeight) {
  timeAnchor.style.display = "none";
  let targetHeight = Math.max(lineHeight, target.getBoundingClientRect().height);
  timeAnchor.style.removeProperty("display");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    applyFloatLayout(timeAnchor, lineHeight, `${targetHeight}px`);
    const laidOutHeight = target.getBoundingClientRect().height;
    if (Math.abs(laidOutHeight - targetHeight) <= LINE_TOLERANCE_PX) return;
    // Keep the anchor from becoming shorter than the final text layout.
    targetHeight = Math.max(targetHeight, laidOutHeight);
  }
}

function timeFitsLastTextLine(text, timeAnchor) {
  const lineRects = getTextLineRects(text);
  const time = timeAnchor.querySelector(".message-time")?.getBoundingClientRect();
  const lastLine = lineRects.at(-1);
  if (!lastLine || !time) return true;

  const sharesLine =
    time.top >= lastLine.top - LINE_TOLERANCE_PX &&
    time.top <= lastLine.bottom + LINE_TOLERANCE_PX;
  return sharesLine && lastLine.right <= time.left + LINE_TOLERANCE_PX;
}

function getTextLineRects(text) {
  const range = document.createRange();
  range.selectNodeContents(text);
  const rows = [];

  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const row = rows.find((candidate) => Math.abs(candidate.top - rect.top) <= LINE_TOLERANCE_PX);
    if (row) {
      row.left = Math.min(row.left, rect.left);
      row.right = Math.max(row.right, rect.right);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else {
      rows.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
  }

  return rows.sort((a, b) => a.top - b.top);
}

function restoreOriginalText(text) {
  if (!text || !Object.hasOwn(text.dataset, "messageTimeText")) return;
  text.replaceChildren(document.createTextNode(text.dataset.messageTimeText));
}

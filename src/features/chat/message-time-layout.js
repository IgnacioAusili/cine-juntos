import { dom } from "../../core/dom.js";

const TIME_GAP_PX = 8;
const LINE_TOLERANCE_PX = 1;

let scheduledFrame = 0;

export function scheduleMessageTimeAdjustment() {
  if (scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    adjustMessageTimes();
  });
}

export function scheduleMessageTimeAdjustmentForBubble(bubble) {
  if (!bubble) return;
  window.requestAnimationFrame(() => {
    adjustMessageTimeForBubble(bubble);
  });
}

export function adjustMessageTimes() {
  for (const container of [dom.messages, dom.overlayMessages]) {
    if (!container) continue;

    container.querySelectorAll(".message-bubble").forEach((bubble) => {
      adjustMessageTimeForBubble(bubble);
    });
  }
}

export function adjustMessageTimeForBubble(bubble) {
  if (!bubble) return;
  const timeAnchor = bubble.querySelector(".message-time-anchor");
  if (!timeAnchor) return;

  resetMessageTimeLayout(timeAnchor);

  const text = bubble.querySelector(".message-text");
  restoreOriginalText(text);

  const lineHeight = getBubbleLineHeight(bubble);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

  const content = bubble.querySelector(".message-content");
  const hasReply = Boolean(content?.querySelector(".message-reply"));
  const textRow = bubble.querySelector(".message-reply-text-row");
  const hasMediaContent = Boolean(
    content?.querySelector(".message-media, .message-video, .message-media-link"),
  );
  if (hasReply && textRow) {
    stabilizeReplyTextLayout(textRow, timeAnchor, lineHeight);
  } else if (text && !hasMediaContent) {
    stabilizeShapeOutsideLayout(text, timeAnchor, lineHeight);
  } else {
    applyShapeOutsideLayout(timeAnchor, lineHeight);
  }

  if (!text || hasMediaContent) return;
  if (timeFitsLastTextLine(text, timeAnchor)) {
    return;
  }

  addMinimalLastLineBreak(text, timeAnchor, lineHeight);
  stabilizeShapeOutsideLayout(text, timeAnchor, lineHeight);
}

function resetMessageTimeLayout(timeAnchor) {
  timeAnchor.style.removeProperty("float");
  timeAnchor.style.removeProperty("height");
  timeAnchor.style.removeProperty("margin-left");
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

function applyShapeOutsideLayout(timeAnchor, lineHeight) {
  timeAnchor.style.float = "right";
  timeAnchor.style.height = "100%";
  timeAnchor.style.marginLeft = `${TIME_GAP_PX}px`;
  timeAnchor.style.shapeOutside = `inset(calc(100% - ${lineHeight}px) 0 0)`;
}

function measureTextHeight(text, timeAnchor) {
  timeAnchor.style.display = "none";
  const height = text.getBoundingClientRect().height;
  timeAnchor.style.removeProperty("display");
  return height;
}

function stabilizeShapeOutsideLayout(text, timeAnchor, lineHeight) {
  let textHeight = Math.max(lineHeight, measureTextHeight(text, timeAnchor));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    applyMeasuredShapeOutsideLayout(timeAnchor, lineHeight, textHeight);
    const laidOutHeight = text.getBoundingClientRect().height;
    if (Math.abs(laidOutHeight - textHeight) <= LINE_TOLERANCE_PX) return;
    // Keep the measured height monotonic so cyclic float reflow cannot leave
    // the anchor shorter than the final text layout.
    textHeight = Math.max(textHeight, laidOutHeight);
  }
}

function applyMeasuredShapeOutsideLayout(timeAnchor, lineHeight, textHeight) {
  timeAnchor.style.float = "right";
  timeAnchor.style.height = `${textHeight}px`;
  timeAnchor.style.marginLeft = `${TIME_GAP_PX}px`;
  timeAnchor.style.shapeOutside = `inset(calc(100% - ${lineHeight}px) 0 0)`;
}

function measureReplyTextHeight(textRow, timeAnchor) {
  timeAnchor.style.display = "none";
  const height = textRow.getBoundingClientRect().height;
  timeAnchor.style.removeProperty("display");
  return height;
}

function stabilizeReplyTextLayout(textRow, timeAnchor, lineHeight) {
  let textHeight = Math.max(lineHeight, measureReplyTextHeight(textRow, timeAnchor));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    applyReplyTextLayout(timeAnchor, lineHeight, textHeight);
    const laidOutHeight = textRow.getBoundingClientRect().height;
    if (laidOutHeight <= textHeight + LINE_TOLERANCE_PX) return;
    textHeight = laidOutHeight;
  }
}

function applyReplyTextLayout(timeAnchor, lineHeight, textHeight) {
  timeAnchor.style.float = "right";
  timeAnchor.style.height = `${textHeight}px`;
  timeAnchor.style.marginLeft = `${TIME_GAP_PX}px`;
  timeAnchor.style.shapeOutside = `inset(calc(100% - ${lineHeight}px) 0 0)`;
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

function addMinimalLastLineBreak(text, timeAnchor, lineHeight) {
  const originalText = text.dataset.messageTimeText ?? text.textContent ?? "";
  if (!originalText.trim()) return;
  text.dataset.messageTimeText = originalText;

  const wordStarts = [...originalText.matchAll(/\S+/g)]
    .map((match) => match.index)
    .filter((index) => index > 0)
    .reverse();
  const recentCharacterStarts = getRecentCharacterStarts(originalText);
  const breakPositions = [...new Set([...wordStarts, ...recentCharacterStarts])];

  for (const start of breakPositions) {
    const prefix = originalText.slice(0, start).trimEnd();
    const suffix = originalText.slice(start).trimStart();
    if (!prefix || !suffix) continue;

    text.replaceChildren(
      document.createTextNode(prefix),
      document.createElement("br"),
      document.createTextNode(suffix),
    );

    if (timeFitsLastTextLine(text, timeAnchor)) return;
  }

  text.replaceChildren(document.createTextNode(originalText));
}

function getRecentCharacterStarts(value) {
  const starts = [];
  const minimumIndex = Math.max(1, value.length - 160);
  let index = 0;

  for (const character of Array.from(value)) {
    if (index >= minimumIndex && index > 0 && !/\s/u.test(character)) {
      starts.push(index);
    }
    index += character.length;
  }

  return starts.reverse();
}

function restoreOriginalText(text) {
  if (!text || !Object.hasOwn(text.dataset, "messageTimeText")) return;
  text.replaceChildren(document.createTextNode(text.dataset.messageTimeText));
}

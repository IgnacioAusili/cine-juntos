import { dom } from "../../core/dom.js";

const TIME_LAYOUT_TOLERANCE_PX = 2;

let scheduledFrame = 0;

export function scheduleMessageTimeAdjustment() {
  if (scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    adjustMessageTimes();
  });
}

export function adjustMessageTimes() {
  for (const container of [dom.messages, dom.overlayMessages]) {
    if (!container) continue;

    const bubbles = container.querySelectorAll(".message-bubble");
    bubbles.forEach((bubble) => {
      const timeAnchor = bubble.querySelector(".message-time-anchor");
      const time = bubble.querySelector(".message-time");
      const content = bubble.querySelector(".message-content");
      if (!timeAnchor || !time || !content) return;

      resetMessageTimeLayout(bubble, timeAnchor, time);

      const computedStyle = window.getComputedStyle(bubble);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight);
      const hasRichContent = Boolean(
        content.querySelector(".message-media, .message-video, .message-media-link, .message-reply"),
      );
      const contentHeight = measureContentHeightWithoutTime(content, timeAnchor);

      if (!hasRichContent && Number.isFinite(lineHeight) && lineHeight > 0) {
        applySingleLineMessageTimeLayout(bubble, timeAnchor, time);

        if (contentHeight <= lineHeight + TIME_LAYOUT_TOLERANCE_PX) {
          return;
        }
      }

      applyMultiLineMessageTimeLayout(bubble, timeAnchor, time, contentHeight, lineHeight);
    });
  }
}

function resetMessageTimeLayout(bubble, timeAnchor, time) {
  bubble.classList.remove("message-bubble--single-line");
  bubble.classList.remove("message-bubble--multi-line");
  timeAnchor.classList.remove("message-time-anchor--inline");
  time.classList.remove("message-time--inline");

  timeAnchor.style.removeProperty("float");
  timeAnchor.style.removeProperty("height");
  timeAnchor.style.removeProperty("margin-left");
  timeAnchor.style.removeProperty("shape-outside");
  timeAnchor.style.removeProperty("order");
  time.style.removeProperty("transform");
}

function measureContentHeightWithoutTime(content, timeAnchor) {
  const previousVisibility = timeAnchor.style.visibility;

  timeAnchor.style.visibility = "hidden";
  const height = content.getBoundingClientRect().height || 0;
  timeAnchor.style.visibility = previousVisibility;

  return height;
}

function applySingleLineMessageTimeLayout(bubble, timeAnchor, time) {
  bubble.classList.add("message-bubble--single-line");
  bubble.classList.remove("message-bubble--multi-line");
  timeAnchor.classList.add("message-time-anchor--inline");
  time.classList.add("message-time--inline");
  timeAnchor.style.float = "none";
  timeAnchor.style.height = "auto";
  timeAnchor.style.marginLeft = "8px";
  timeAnchor.style.shapeOutside = "none";
  timeAnchor.style.order = "2";
}

function applyMultiLineMessageTimeLayout(bubble, timeAnchor, time, contentHeight, lineHeight) {
  bubble.classList.remove("message-bubble--single-line");
  bubble.classList.add("message-bubble--multi-line");
  timeAnchor.classList.remove("message-time-anchor--inline");
  time.classList.remove("message-time--inline");

  const timeHeight = time.getBoundingClientRect().height || lineHeight;
  const anchorHeight = Math.max(Math.ceil(contentHeight - lineHeight + timeHeight), Math.ceil(lineHeight));
  timeAnchor.style.float = "right";
  timeAnchor.style.height = `${anchorHeight}px`;
  timeAnchor.style.marginLeft = "8px";
  timeAnchor.style.shapeOutside = `inset(calc(100% - ${lineHeight}px) 0 0)`;
  timeAnchor.style.order = "";

  const timeLift = Math.max(2, Math.round((lineHeight - timeHeight) * 0.6));
  time.style.transform = `translateY(-${timeLift}px)`;
}

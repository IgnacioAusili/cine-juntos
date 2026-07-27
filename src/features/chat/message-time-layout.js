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
      if (bubble.closest(".message.system")) return;

      const content = bubble.querySelector(".message-content");
      const time = bubble.querySelector(".message-time");
      if (!content || !time) return;

      resetMessageTimeLayout(bubble, time);

      const style = window.getComputedStyle(content);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const contentHeight = content.offsetHeight;
      const hasRichContent = Boolean(
        content.querySelector(".message-media, .message-video, .message-media-link, .message-reply"),
      );

      if (!hasRichContent && Number.isFinite(lineHeight) && contentHeight <= lineHeight + TIME_LAYOUT_TOLERANCE_PX) {
        applySingleLineMessageTimeLayout(bubble, time);
      } else {
        applyMultiLineMessageTimeLayout(bubble, time);
      }
    });
  }
}

function resetMessageTimeLayout(bubble, time) {
  bubble.classList.remove("message-bubble--single-line");
  bubble.style.removeProperty("--message-time-fade-bg");

  time.classList.remove("message-time--inline");
  time.style.removeProperty("position");
  time.style.removeProperty("right");
  time.style.removeProperty("bottom");
  time.style.removeProperty("margin-left");
  time.style.removeProperty("padding-left");
  time.style.removeProperty("background");
  time.style.removeProperty("transform");
}

function applySingleLineMessageTimeLayout(bubble, time) {
  bubble.classList.add("message-bubble--single-line");
  time.classList.add("message-time--inline");
}

function applyMultiLineMessageTimeLayout(bubble, time) {
  const bubbleBg = window.getComputedStyle(bubble).backgroundColor;
  bubble.style.setProperty("--message-time-fade-bg", bubbleBg);
  time.style.background = `linear-gradient(to left, ${bubbleBg} 70%, transparent 100%)`;
  time.style.paddingLeft = "8px";
}

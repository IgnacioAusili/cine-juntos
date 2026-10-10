const systemMessageLayoutObservers = new WeakMap();
const systemMessageLayoutFrames = new WeakMap();

export function watchSystemMessageLayout(container) {
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
export function fitSystemMessageBubble(itemOrBubble) {
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
    const lineElements = bubble.querySelectorAll(".message-system-line");
    const beforeWidth = lineElements[0]
      ? Number.parseFloat(getComputedStyle(lineElements[0]).width) || 0
      : 0;
    const lastLine = lineElements[lineElements.length - 1];
    const afterWidth = lastLine
      ? Number.parseFloat(getComputedStyle(lastLine).width) || 0
      : 0;
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

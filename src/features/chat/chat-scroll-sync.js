import { checkScrollPosition } from "./unread-counters.js";

const pendingScrollSync = new WeakMap();
const DEFAULT_PIN_THRESHOLD = 10;

export function isPinnedToBottom(container, threshold = DEFAULT_PIN_THRESHOLD) {
  if (!container) return false;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= threshold;
}

export function queuePinnedChatScrollSync(container, isOverlay, shouldSync) {
  if (!shouldSync || !container) return;

  const previousFrameId = pendingScrollSync.get(container);
  if (previousFrameId != null) {
    window.cancelAnimationFrame(previousFrameId);
  }

  const frameId = window.requestAnimationFrame(() => {
    pendingScrollSync.delete(container);
    container.scrollTop = container.scrollHeight;
    checkScrollPosition(isOverlay);
  });

  pendingScrollSync.set(container, frameId);
}

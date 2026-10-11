import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { expandSystemMessageGroupForItem } from "./system-message-groups.js?v=20261011-chat-interaction-fixes-01";

const pendingOverlayHighlights = new WeakMap();
const pendingOverlayHighlightTimers = new WeakMap();

export function scrollToMessage(messageId, preferredContainer = null) {
  if (!messageId) return;
  const containers = [preferredContainer, dom.overlayMessages, dom.messages].filter(
    (container, index, all) => container && all.indexOf(container) === index,
  );
  for (const container of containers) {
    const target = container.querySelector(
      `article[data-message-id="${messageId}"]`,
    );
    if (target) {
      const expansion = expandSystemMessageGroupForItem(target);
      if (expansion) {
        expansion.then(() => scrollToMessage(messageId, container));
        return;
      }

      const targetTop = target.offsetTop;
      const targetBottom = targetTop + target.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const fullyVisible = targetTop >= viewTop && targetBottom <= viewBottom;

      if (!fullyVisible) {
        const nextTop = Math.max(0, targetTop - container.clientHeight / 2 + target.offsetHeight / 2);
        container.scrollTo({ top: nextTop, behavior: "smooth" });
      }

      highlightMessage(target);
      return;
    }
  }
}

/**
 * Aplica un efecto visual de resaltado temporal a un elemento de mensaje.
 */
function highlightMessage(element) {
  const overlayContainer = element.closest(".overlay-messages");
  if (overlayContainer) {
    highlightOverlayMessage(overlayContainer, element);
    return;
  }

  const highlightContainer = element.closest(".messages");
  if (highlightContainer) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = highlightContainer.getBoundingClientRect();
    element.style.setProperty("--message-highlight-left", `${containerRect.left - elementRect.left - 2}px`);
    element.style.setProperty("--message-highlight-width", `${containerRect.width + 4}px`);
  }

  element.classList.remove("message-highlight");
  void element.offsetWidth; // Force reflow
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
    element.style.removeProperty("--message-highlight-left");
    element.style.removeProperty("--message-highlight-width");
  }, 2600);
}

function highlightOverlayMessage(container, element) {
  const previousHighlight = pendingOverlayHighlights.get(container);
  if (previousHighlight) {
    previousHighlight.remove();
    pendingOverlayHighlights.delete(container);
  }
  const previousTimer = pendingOverlayHighlightTimers.get(container);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
    pendingOverlayHighlightTimers.delete(container);
  }

  const highlight = document.createElement("div");
  highlight.className = "message-highlight message-highlight--overlay";
  highlight.style.top = `${Math.max(0, element.offsetTop - 2)}px`;
  highlight.style.height = `${element.offsetHeight + 4}px`;
  container.append(highlight);
  pendingOverlayHighlights.set(container, highlight);

  void highlight.offsetWidth; // Force reflow for the pulse animation

  const timer = window.setTimeout(() => {
    if (pendingOverlayHighlights.get(container) !== highlight) return;
    highlight.remove();
    pendingOverlayHighlights.delete(container);
    pendingOverlayHighlightTimers.delete(container);
  }, 2600);
  pendingOverlayHighlightTimers.set(container, timer);
}

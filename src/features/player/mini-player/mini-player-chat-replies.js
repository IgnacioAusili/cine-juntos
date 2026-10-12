import { clearReplyTarget, setReplyTarget } from "../../chat/messages/chat-reply.js";
import { wireMessageInteractions } from "../../chat/messages/chat-message-interactions.js";
import { setMiniSystemGroupVisibility, animateMiniSystemGroupTransition } from "./mini-player-chat-groups.js";
import { state } from "../../../core/state.js";

export function wireMiniMessageReplies(sourceMessages, mirrorMessages, surfaceElement) {
  const mirrorInput = surfaceElement.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!mirrorInput) return;

  mirrorMessages.querySelectorAll(".message").forEach((mirrorItem) => {
    if (mirrorItem.classList.contains('message--system-group-member') && mirrorItem.dataset.groupClickWired !== "true") {
      mirrorItem.dataset.groupClickWired = "true";
      mirrorItem.addEventListener("click", (event) => {
        if (event.target.closest?.("button, input, textarea, select")) return;
        const toggle = findMiniGroupToggle(mirrorItem);
        if (!toggle || toggle.classList.contains('u-transitioning')) return;
        event.stopPropagation();
        const expanded = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(expanded));
        setMiniSystemGroupVisibility(toggle, expanded);
        animateMiniSystemGroupTransition(toggle, expanded);
      });
    }
    const sourceItem = sourceMessages.querySelector(`[data-message-id=\"${CSS.escape(mirrorItem.dataset.messageId || "")}\"]`);
    const message = sourceItem?._chatMessage;
    const isMediaOnly = mirrorItem.classList.contains("message--media-only");
    const bubble = mirrorItem.querySelector('.message__bubble, .message__media-strip');
    const hint = mirrorItem.querySelector('.message__swipe-reply-hint');
    const row = mirrorItem.querySelector('.message__bubble-row, .message__media-row');
    if (!message || !bubble || !hint || !row || mirrorItem.dataset.replyWired === "true") return;
    mirrorItem.dataset.replyWired = "true";
    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget: (replyMessage, replyInput) => {
        setReplyTarget(replyMessage, replyInput);
        syncMiniReplyPreview(sourceMessages, mirrorMessages, surfaceElement);
      },
      replyInput: mirrorInput,
      companions: isMediaOnly
        ? [mirrorItem.querySelector('.message__meta'), mirrorItem.querySelector('.message__time-anchor')].filter(Boolean)
        : [mirrorItem.querySelector('.message__meta')].filter(Boolean),
      interactionTarget: mirrorItem,
      interactionBand: mirrorItem,
      allowSwipeInsideBubble: true,
    });
  });
}

function syncMiniReplyPreview(sourceMessages, mirrorMessages, surfaceElement) {
  const sourcePreview = sourceMessages.closest(".player-chat")?.querySelector("#overlayReplyPreview")
    || document.querySelector("#overlayReplyPreview");
  const mirrorPreview = surfaceElement.querySelector("#overlayReplyPreview, [data-proxy-for=\"overlayReplyPreview\"]");
  if (!sourcePreview || !mirrorPreview) return;
  mirrorPreview.className = sourcePreview.className;
  mirrorPreview.innerHTML = sourcePreview.innerHTML;
  mirrorPreview.hidden = sourcePreview.hidden;
  mirrorPreview.querySelector('.reply-preview__close')?.addEventListener("click", () => {
    clearReplyTarget();
    mirrorPreview.hidden = true;
  }, { once: true });
  mirrorPreview.querySelector('.reply-preview__text')?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const messageId = state.chat.replyTarget?.id;
    if (messageId) scrollMiniMirrorToMessage(messageId, mirrorMessages);
  });
}

function scrollMiniMirrorToMessage(messageId, container) {
  const target = Array.from(container?.children || []).find(
    (item) => item.dataset.messageId === messageId,
  );
  if (!target) return;

  if (target.classList.contains('message--system-group-collapsed-item')) {
    const toggle = findMiniGroupToggle(target);
    if (toggle) {
      setMiniSystemGroupVisibility(toggle, true);
      animateMiniSystemGroupTransition(toggle, true);
    }
  }

  const targetTop = target.offsetTop;
  const targetBottom = targetTop + target.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (targetTop < viewTop || targetBottom > viewBottom) {
    container.scrollTo({
      top: Math.max(0, targetTop - container.clientHeight / 2 + target.offsetHeight / 2),
      behavior: "smooth",
    });
  }

  highlightMiniOverlayMessage(container, target);
}

function findMiniGroupToggle(item) {
  const items = [item];
  let current = item.previousElementSibling;
  while (current?.classList.contains("message") && current.classList.contains('message--system')) {
    items.unshift(current);
    current = current.previousElementSibling;
  }
  current = item.nextElementSibling;
  while (current?.classList.contains("message") && current.classList.contains('message--system')) {
    items.push(current);
    current = current.nextElementSibling;
  }
  return items.map((groupItem) => groupItem.querySelector('.message__system-group-toggle')).find(Boolean) || null;
}

function highlightMiniOverlayMessage(container, element) {
  container.querySelectorAll(".message-highlight--overlay").forEach((highlight) => highlight.remove());
  const highlight = document.createElement("div");
  highlight.className = "message-highlight message-highlight--overlay";
  highlight.style.top = `${Math.max(0, element.offsetTop - 2)}px`;
  highlight.style.height = `${element.offsetHeight + 4}px`;
  container.append(highlight);
  window.setTimeout(() => highlight.remove(), 2600);
}

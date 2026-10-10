import { clearReplyTarget, setReplyTarget } from "../chat/chat-reply.js?v=20261010-file-size-refactor-02";
import { wireMessageInteractions } from "../chat/chat-message-interactions.js?v=20261010-file-size-refactor-02";
import { setMiniSystemGroupVisibility, animateMiniSystemGroupTransition } from "./mini-player-chat-groups.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";

export function wireMiniMessageReplies(sourceMessages, mirrorMessages, surfaceElement) {
  const mirrorInput = surfaceElement.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!mirrorInput) return;

  mirrorMessages.querySelectorAll(".message").forEach((mirrorItem) => {
    if (mirrorItem.classList.contains("system-group-member") && mirrorItem.dataset.groupClickWired !== "true") {
      mirrorItem.dataset.groupClickWired = "true";
      mirrorItem.addEventListener("click", (event) => {
        if (event.target.closest?.("button, input, textarea, select")) return;
        const toggle = findMiniGroupToggle(mirrorItem);
        if (!toggle || toggle.classList.contains("system-group-transitioning")) return;
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
    const bubble = mirrorItem.querySelector(".message-bubble, .message-media-strip");
    const hint = mirrorItem.querySelector(".swipe-reply-hint");
    const row = mirrorItem.querySelector(".message-bubble-row, .message-media-row");
    if (!message || !bubble || !hint || !row || mirrorItem.dataset.replyWired === "true") return;
    mirrorItem.dataset.replyWired = "true";
    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget: (replyMessage, replyInput) => {
        setReplyTarget(replyMessage, replyInput);
        syncMiniReplyPreview(sourceMessages, mirrorMessages, surfaceElement);
      },
      replyInput: mirrorInput,
      companions: isMediaOnly
        ? [mirrorItem.querySelector(".message-meta"), mirrorItem.querySelector(".message-time-anchor")].filter(Boolean)
        : [mirrorItem.querySelector(".message-meta")].filter(Boolean),
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
  mirrorPreview.querySelector(".reply-preview-close")?.addEventListener("click", () => {
    clearReplyTarget();
    mirrorPreview.hidden = true;
  }, { once: true });
  mirrorPreview.querySelector(".reply-preview-text")?.addEventListener("click", (event) => {
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

  if (target.classList.contains("system-group-collapsed-item")) {
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
  while (current?.classList.contains("message") && current.classList.contains("system")) {
    items.unshift(current);
    current = current.previousElementSibling;
  }
  current = item.nextElementSibling;
  while (current?.classList.contains("message") && current.classList.contains("system")) {
    items.push(current);
    current = current.nextElementSibling;
  }
  return items.map((groupItem) => groupItem.querySelector(".system-group-toggle")).find(Boolean) || null;
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

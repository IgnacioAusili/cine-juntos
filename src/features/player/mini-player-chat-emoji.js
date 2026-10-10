import { focusChatInput } from "../chat/chat-input-focus.js?v=20261010-file-size-refactor-02";

const EMOJI_POPOVER_TAIL_INSET_PX = 12;
const EMOJI_POPOVER_TRANSITION_MS = 150;
const MOBILE_CHAT_LAYOUT_QUERY = "(max-width: 980px)";
const miniEmojiPopoverHideTimers = new WeakMap();

function isMobileChatLayout() { return Boolean(window.matchMedia && window.matchMedia(MOBILE_CHAT_LAYOUT_QUERY).matches); }
function getMirrorChatInput(element) { return element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]"); }

export function toggleMiniEmojiPicker(element) {
  const surface = element.closest(".mini-player-surface");
  const input = getMirrorChatInput(element);
  if (!surface || !input) return;

  const popover = getMiniEmojiPopover(surface);
  if (!popover.hidden) {
    hideMiniEmojiPopover(popover);
    return;
  }

  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  const hideTimer = miniEmojiPopoverHideTimers.get(popover);
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    miniEmojiPopoverHideTimers.delete(popover);
  }
  popover.hidden = false;
  popover.classList.remove("is-emoji-popover-closing");
  const anchor = element.querySelector(
    "#overlayEmojiButton, [data-proxy-for=\"overlayEmojiButton\"]",
  );
  if (anchor) {
    const popoverRect = popover.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const anchorOffset = Math.min(
      popoverRect.width - EMOJI_POPOVER_TAIL_INSET_PX,
      Math.max(
        EMOJI_POPOVER_TAIL_INSET_PX,
        anchorRect.left + anchorRect.width / 2 - popoverRect.left,
      ),
    );
    popover.dataset.placement = popoverRect.bottom <= anchorRect.top
      ? "top"
      : "bottom";
    popover.style.setProperty("--emoji-popover-anchor-x", `${anchorOffset}px`);
  }
  window.requestAnimationFrame(() => {
    if (popover.hidden || popover.classList.contains("is-emoji-popover-closing")) return;
    popover.classList.add("is-emoji-popover-open");
  });
  if (!isMobileChatLayout()) {
    requestAnimationFrame(() => focusChatInput(input, selectionStart, selectionEnd));
  }
}

function hideMiniEmojiPopover(popover) {
  if (popover.hidden || popover.classList.contains("is-emoji-popover-closing")) return;
  const hideTimer = miniEmojiPopoverHideTimers.get(popover);
  if (hideTimer) window.clearTimeout(hideTimer);
  popover.classList.remove("is-emoji-popover-open");
  popover.classList.add("is-emoji-popover-closing");
  const nextHideTimer = window.setTimeout(() => {
    popover.hidden = true;
    popover.classList.remove("is-emoji-popover-closing");
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    miniEmojiPopoverHideTimers.delete(popover);
  }, EMOJI_POPOVER_TRANSITION_MS);
  miniEmojiPopoverHideTimers.set(popover, nextHideTimer);
}

function getMiniEmojiPopover(surface) {
  let popover = surface.querySelector(".mini-emoji-popover");
  if (popover) return popover;

  popover = surface.ownerDocument.createElement("div");
  popover.className = "emoji-popover mini-emoji-popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "Selector de emojis");
  const fog = surface.ownerDocument.createElement("span");
  fog.className = "emoji-popover-fog";
  fog.setAttribute("aria-hidden", "true");
  popover.append(fog);
  const sourceOptions = document.querySelector("#emojiPopover")?.children || [];
  [...sourceOptions].filter((option) => option.classList.contains("emoji-option")).forEach((option) => popover.append(
    surface.ownerDocument.importNode(option, true),
  ));
  popover.addEventListener("mousedown", (event) => event.preventDefault());
  popover.addEventListener("click", (event) => insertMiniEmoji(surface, event.target));
  surface.append(popover);
  return popover;
}

function insertMiniEmoji(surface, target) {
  const option = target.closest?.(".emoji-option");
  const input = surface.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!option || !input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${option.textContent}${input.value.slice(end)}`;
  const position = start + option.textContent.length;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (isMobileChatLayout()) {
    input.setSelectionRange?.(position, position);
  } else {
    focusChatInput(input, position, position);
  }
  hideMiniEmojiPopover(surface.querySelector(".mini-emoji-popover"));
}

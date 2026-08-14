import { clearReplyTarget, setReplyTarget } from "../chat/chat-reply.js?v=20260813-overlay-reply-fix-01";
import { wireMessageInteractions } from "../chat/chat-message-interactions.js";
import { setInsideChatAutoExpandEnabled } from "../chat/chat-layout.js";
import { state } from "../../core/state.js";

export function isOverlayMessageInput(source, target) {
  return source.id === "playerChat" && target.id === "overlayMessageInput";
}

export function isOverlayMessageSubmit(source, target) {
  return source.id === "playerChat" && target.id === "overlayMessageSend";
}

export function isOverlayEmojiButton(source, target) {
  return source.id === "playerChat" && target.id === "overlayEmojiButton";
}

export function submitMirrorChat(source, element) {
  const mirrorInput = getMirrorChatInput(element);
  const sourceInput = source.querySelector("#overlayMessageInput");
  const sourceForm = source.querySelector("#overlayMessageForm");
  if (!mirrorInput || !sourceInput || !sourceForm) return;
  sourceInput.value = mirrorInput.value;
  sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
  mirrorInput.value = "";
  sourceForm.requestSubmit();
}

export function getMirrorChatDraft(source, element) {
  return source.id === "playerChat" ? getMirrorChatInput(element)?.value || "" : "";
}

export function restoreMirrorChatDraft(source, element, draft) {
  if (source.id !== "playerChat") return;
  const input = getMirrorChatInput(element);
  if (input) input.value = draft;
}

export function wireMirrorChatScrollbar(element) {
  const messages = element.querySelector(".overlay-messages");
  const shell = messages?.closest(".messages-wrap");
  const track = shell?.querySelector(".chat-scrollbar");
  const thumb = shell?.querySelector(".chat-scrollbar-thumb");
  if (!messages || !shell || !track || !thumb) return;

  const syncScrollbar = () => {
    const overflow = messages.scrollHeight - messages.clientHeight;
    if (overflow <= 1) {
      shell.removeAttribute("data-scrollbar-visible");
      return;
    }
    const trackHeight = Math.max(0, track.clientHeight);
    const thumbHeight = Math.max(12, Math.min(trackHeight, Math.round(trackHeight * messages.clientHeight / messages.scrollHeight)));
    const top = Math.round((trackHeight - thumbHeight) * messages.scrollTop / overflow);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
    shell.setAttribute("data-scrollbar-visible", "true");
  };

  messages.addEventListener("scroll", syncScrollbar, { passive: true });
  syncScrollbar();
}

export function syncMirroredChatMessages(source, element) {
  const sourceMessages = source.querySelector(".overlay-messages");
  const mirrorMessages = element.querySelector(".overlay-messages");
  if (!sourceMessages || !mirrorMessages) return;
  const previousStates = [...mirrorMessages.querySelectorAll(".system-group-toggle")]
    .map((toggle) => toggle.getAttribute("aria-expanded"));
  mirrorMessages.innerHTML = sourceMessages.innerHTML;
  wireMirrorChatScrollbar(element);
  wireMiniMessageReplies(sourceMessages, mirrorMessages, element);

  mirrorMessages.querySelectorAll(".system-group-toggle").forEach((toggle, index) => {
    const previous = previousStates[index];
    const sourceExpanded = toggle.getAttribute("aria-expanded") === "true";
    const expanded = previous == null
      ? sourceExpanded
      : previous === "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    setMiniSystemGroupVisibility(toggle, expanded);
    if (previous && previous !== String(sourceExpanded)) {
      animateMiniSystemGroupTransition(toggle, expanded);
    }
  });
}

export function setMiniSystemGroupVisibility(toggle, expanded) {
  const anchor = toggle.closest(".message.system");
  if (!anchor) return;

  const items = [anchor];
  let item = anchor.previousElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.unshift(item);
    item = item.previousElementSibling;
  }

  item = anchor.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }

  items.forEach((systemItem, index) => {
    systemItem.classList.toggle(
      "system-group-collapsed-item",
      !expanded && index < items.length - 1,
    );
  });

  const visibleItem = expanded ? items[0] : items.at(-1);
  const row = visibleItem?.querySelector(".system-message-row") || visibleItem;
  if (row && toggle.parentElement !== row) row.append(toggle);
}

export function animateMiniSystemGroupTransition(toggle, expanded) {
  const anchor = toggle.closest(".message.system");
  if (!anchor) return;

  const items = [anchor];
  let item = anchor.previousElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.unshift(item);
    item = item.previousElementSibling;
  }

  item = anchor.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }

  const animatedItems = expanded ? items : [items.at(-1)];
  animatedItems.forEach((systemItem) => {
    const row = systemItem?.querySelector(".system-message-row") || systemItem;
    row?.animate(
      expanded
        ? [
            { opacity: 0.35, transform: "translateY(-3px)" },
            { opacity: 1, transform: "translateY(0)" },
          ]
        : [
            { opacity: 0.68, transform: "translateY(-2px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  });
}

export function wireMiniMessageReplies(sourceMessages, mirrorMessages, surfaceElement) {
  const mirrorInput = surfaceElement.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!mirrorInput) return;

  mirrorMessages.querySelectorAll(".message").forEach((mirrorItem) => {
    const sourceItem = sourceMessages.querySelector(`[data-message-id=\"${CSS.escape(mirrorItem.dataset.messageId || "")}\"]`);
    const message = sourceItem?._chatMessage;
    const bubble = mirrorItem.querySelector(".message-bubble");
    const hint = mirrorItem.querySelector(".swipe-reply-hint");
    const row = mirrorItem.querySelector(".message-bubble-row");
    if (!message || !bubble || !hint || !row || mirrorItem.dataset.replyWired === "true") return;
    mirrorItem.dataset.replyWired = "true";
    wireMessageInteractions(bubble, message, hint, {
      setReplyTarget: (replyMessage, replyInput) => {
        setReplyTarget(replyMessage, replyInput);
        syncMiniReplyPreview(sourceMessages, mirrorMessages, surfaceElement);
      },
      replyInput: mirrorInput,
      interactionTarget: mirrorItem,
      interactionBand: row,
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
}

export function handleMiniChatInteraction(element, eventTarget) {
  const surface = element.closest(".mini-player-surface")
    || element.ownerDocument.querySelector(".mini-player-surface");
  const styleButton = eventTarget.closest?.("[data-chat-style]");
  if (surface && styleButton) {
    surface.dataset.chatStyle = styleButton.dataset.chatStyle;
    element.querySelectorAll("[data-chat-style]").forEach((button) => {
      button.classList.toggle("active", button === styleButton);
    });
    document.querySelector("#playerChat")?.querySelectorAll("[data-chat-style]").forEach((button) => {
      button.classList.toggle("active", button.dataset.chatStyle === styleButton.dataset.chatStyle);
    });
    return;
  }

  const groupToggle = eventTarget.closest?.(".system-group-toggle");
  if (groupToggle) {
    const toggleIndex = [...element.querySelectorAll(".system-group-toggle")].indexOf(groupToggle);
    document.querySelector("#playerChat")?.querySelectorAll(".system-group-toggle")?.[toggleIndex]?.click();
    return;
  }

  const autoExpand = eventTarget.closest?.("#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]");
  if (autoExpand) {
    const enabled = autoExpand.getAttribute("aria-checked") !== "true";
    syncMiniChatAutoExpand(element.closest(".mini-player-surface"), enabled);
    setInsideChatAutoExpandEnabled(enabled);
    return;
  }

  const scrollButton = eventTarget.closest?.("#overlayScrollBottomBtn, [data-proxy-for=\"overlayScrollBottomBtn\"]");
  if (scrollButton) {
    const messages = element.querySelector(".overlay-messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }
}

export function toggleMiniEmojiPicker(element) {
  const surface = element.closest(".mini-player-surface");
  const input = getMirrorChatInput(element);
  if (!surface || !input) return;

  const popover = getMiniEmojiPopover(surface);
  if (!popover.hidden) {
    popover.hidden = true;
    return;
  }

  popover.hidden = false;
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

export function toggleMiniChatOverlay(
  surface,
  visible = !surface.classList.contains("chat-inside-open"),
) {
  surface.classList.toggle("chat-inside-open", visible);
  const toggle = surface.querySelector("#playerChatToggleButton, [data-proxy-for=\"playerChatToggleButton\"]");
  if (toggle) {
    const label = visible ? "Ocultar chat (Tab)" : "Mostrar chat (Tab)";
    toggle.classList.toggle("active", visible);
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.dataset.tooltip = label;
    toggle.setAttribute("aria-label", label);
  }
}

export function syncMiniChatAutoExpand(surface, enabled = state.chat.autoExpandInsideEnabled) {
  const toggle = surface?.querySelector(
    "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
  );
  if (!toggle) return;
  toggle.classList.toggle("active", Boolean(enabled));
  toggle.setAttribute("aria-checked", String(Boolean(enabled)));
}

function getMirrorChatInput(element) {
  return element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
}

function getMiniEmojiPopover(surface) {
  let popover = surface.querySelector(".mini-emoji-popover");
  if (popover) return popover;

  popover = surface.ownerDocument.createElement("div");
  popover.className = "emoji-popover mini-emoji-popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "Selector de emojis");
  const sourceOptions = document.querySelector("#emojiPopover")?.children || [];
  [...sourceOptions].forEach((option) => popover.append(
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
  input.focus({ preventScroll: true });
  input.setSelectionRange?.(position, position);
  surface.querySelector(".mini-emoji-popover").hidden = true;
}

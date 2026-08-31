import { clearReplyTarget, setReplyTarget } from "../chat/chat-reply.js?v=20260826-reply-sync-close-03";
import { wireMessageInteractions } from "../chat/chat-message-interactions.js";
import { setInsideChatAutoExpandEnabled } from "../chat/chat-layout.js";
import { state } from "../../core/state.js";
import { focusChatInput } from "../chat/chat-input-focus.js";

const mirroredSystemGroupStates = new WeakMap();
const miniSystemGroupAnimations = new WeakMap();

export function normalizeMiniSystemGroupState(container) {
  container?.querySelectorAll(".message.system").forEach((systemMessage) => {
    const targets = [systemMessage, ...systemMessage.querySelectorAll("*")];
    targets.forEach((target) => {
      target.classList.remove("system-group-transitioning");
      target.getAnimations?.().forEach((animation) => animation.cancel());
      target.style.removeProperty("opacity");
      target.style.removeProperty("transform");
    });
  });
}

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
  const isInitialSync = !mirroredSystemGroupStates.has(element);
  const previousStates = [...mirrorMessages.querySelectorAll(".system-group-toggle")]
    .map((toggle) => toggle.getAttribute("aria-expanded"));
  const previousSourceStates = mirroredSystemGroupStates.get(element) || [];
  const nextSourceStates = [];
  mirrorMessages.innerHTML = sourceMessages.innerHTML;
  if (isInitialSync) normalizeMiniSystemGroupState(mirrorMessages);
  wireMirrorChatScrollbar(element);
  wireMiniMessageReplies(sourceMessages, mirrorMessages, element);

  mirrorMessages.querySelectorAll(".system-group-toggle").forEach((toggle, index) => {
    const previous = previousStates[index];
    const sourceExpanded = toggle.getAttribute("aria-expanded") === "true";
    const expanded = previous == null
      ? sourceExpanded
      : previous === "true";
    nextSourceStates[index] = String(sourceExpanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    setMiniSystemGroupVisibility(toggle, expanded);
    if (
      previousSourceStates[index] != null
      && previousSourceStates[index] !== String(sourceExpanded)
    ) {
      animateMiniSystemGroupTransition(toggle, expanded);
    }
  });
  mirroredSystemGroupStates.set(element, nextSourceStates);
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

  const previousTransition = miniSystemGroupAnimations.get(anchor);
  previousTransition?.animations.forEach((animation) => animation.cancel());

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
  items.forEach((systemItem) => systemItem.classList.add("system-group-transitioning"));
  const animations = [];
  animatedItems.forEach((systemItem) => {
    const row = systemItem?.querySelector(".system-message-row") || systemItem;
    const animation = row?.animate(
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
    if (animation) animations.push(animation);
  });
  const transition = { animations };
  miniSystemGroupAnimations.set(anchor, transition);
  Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    if (miniSystemGroupAnimations.get(anchor) !== transition) return;
    items.forEach((systemItem) => systemItem.classList.remove("system-group-transitioning"));
    miniSystemGroupAnimations.delete(anchor);
  });
}

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
      interactionBands: [mirrorItem.querySelector(".message-meta")],
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

  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  popover.hidden = false;
  requestAnimationFrame(() => focusChatInput(input, selectionStart, selectionEnd));
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
  focusChatInput(input, position, position);
  surface.querySelector(".mini-emoji-popover").hidden = true;
}

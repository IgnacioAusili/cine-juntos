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
  mirrorMessages.innerHTML = sourceMessages.innerHTML;
  wireMirrorChatScrollbar(element);
}

export function handleMiniChatInteraction(element, eventTarget) {
  const surface = element.closest(".mini-player-surface");
  const styleButton = eventTarget.closest?.("[data-chat-style]");
  if (surface && styleButton) {
    surface.dataset.chatStyle = styleButton.dataset.chatStyle;
    element.querySelectorAll("[data-chat-style]").forEach((button) => {
      button.classList.toggle("active", button === styleButton);
    });
    return;
  }

  const autoExpand = eventTarget.closest?.("#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]");
  if (autoExpand) {
    const enabled = autoExpand.getAttribute("aria-checked") !== "true";
    autoExpand.setAttribute("aria-checked", String(enabled));
    autoExpand.classList.toggle("active", enabled);
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

import { clearReplyTarget, setReplyTarget } from "../chat/chat-reply.js?v=20261010-file-size-refactor-02";
import { extendMessageHitArea } from "../chat/chat-message-interactions.js?v=20261010-file-size-refactor-02";
import { setInsideChatAutoExpandEnabled } from "../chat/chat-layout.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { wireMiniMessageReplies } from "./mini-player-chat-replies.js?v=20261010-file-size-refactor-02";
import { mirroredSystemGroupStates, setMiniSystemGroupVisibility, animateMiniSystemGroupTransition } from "./mini-player-chat-groups.js?v=20261010-file-size-refactor-02";
export { normalizeMiniSystemGroupState, setMiniSystemGroupVisibility, animateMiniSystemGroupTransition } from "./mini-player-chat-groups.js?v=20261010-file-size-refactor-02";
export { wireMiniMessageReplies } from "./mini-player-chat-replies.js?v=20261010-file-size-refactor-02";
export { toggleMiniEmojiPicker } from "./mini-player-chat-emoji.js?v=20261010-file-size-refactor-02";


function getMirrorChatInput(element) {
  return element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
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
  mirrorMessages.querySelectorAll(".message").forEach((item) => {
    extendMessageHitArea(item, mirrorMessages);
  });
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
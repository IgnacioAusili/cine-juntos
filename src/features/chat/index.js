// Coordinacion general del chat: cableado de eventos, layout y reexport de submodulos.
import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { CHAT_DOCK_META } from "../../core/utils.js";
import {
  autoResizeMessageInput,
  handlePasteEvent,
  hideEmojiPicker,
  submitMessageFrom,
  toggleEmojiPicker,
  updateCharCounter,
} from "./chat-input.js";
import { setReplyTarget } from "./chat-reply.js";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "./unread-counters.js";
import {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./message-menu.js";
import {
  setChatDock,
  setExternalChatCollapsed,
  setInsideChatStyle,
  setInsideChatVisible,
} from "./chat-layout.js";

export {
  buildEmojiPicker,
  updateCharCounter,
  sendMessage,
} from "./chat-input.js";
export { renderMessage } from "./chat-render.js";
export {
  clearReplyTarget,
  renderReplyPreview,
  scrollToMessage,
  setReplyTarget,
} from "./chat-reply.js";
export { sendVideoEventMessage } from "./chat-system-messages.js";
export {
  checkScrollPosition,
  resetExternalUnread,
  resetInsideUnread,
} from "./unread-counters.js";
export {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./message-menu.js";
export {
  setChatDock,
  setExternalChatCollapsed,
  setInsideChatStyle,
  setInsideChatVisible,
  updateCollapseButton,
} from "./chat-layout.js";

export function wireChatEvents() {
  dom.chatStyleToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-style]");
    if (!button) return;
    setInsideChatStyle(button.dataset.chatStyle);
  });

  dom.playerChatToggleButton.addEventListener("click", () => {
    setInsideChatVisible(
      !dom.playerFrame.classList.contains("chat-inside-open"),
    );
  });

  dom.closeInsideChatButton.addEventListener("click", () => {
    setInsideChatVisible(false);
  });

  dom.dockChatButton.addEventListener("click", () => {
    const currentDock = dom.sessionView.dataset.chatDock || "right";
    setChatDock(CHAT_DOCK_META[currentDock]?.next || "right");
  });

  dom.collapseChatButton.addEventListener("click", () => {
    setExternalChatCollapsed(
      !dom.sessionView.classList.contains("chat-collapsed"),
    );
  });

  dom.messageEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.messageInput, dom.messageEmojiButton);
  });

  dom.overlayEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.overlayMessageInput, dom.overlayEmojiButton);
  });

  document.addEventListener("click", (event) => {
    if (dom.emojiPopover.hidden) return;
    if (dom.emojiPopover.contains(event.target)) return;
    if (event.target.closest(".emoji-trigger")) return;
    hideEmojiPicker();
  });

  document.addEventListener("click", (event) => {
    if (dom.messageMenu.hidden) return;
    if (Date.now() - state.chat.messageMenuOpenedAt < 220) return;
    if (dom.messageMenu.contains(event.target)) return;
    hideMessageMenu();
  });

  dom.messageMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action || !state.chat.menuMessage) return;
    if (action === "copy") copyMessageText(state.chat.menuMessage);
    if (action === "reply") setReplyTarget(state.chat.menuMessage);
    hideMessageMenu();
  });

  dom.messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.messageInput);
  });

  dom.overlayMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.overlayMessageInput);
  });

  [dom.messageInput, dom.overlayMessageInput].forEach((input) => {
    const isOverlay = input === dom.overlayMessageInput;
    input.addEventListener("input", () => {
      autoResizeMessageInput(input);
      updateCharCounter(input, isOverlay);
    });
    input.addEventListener("paste", () =>
      window.setTimeout(() => {
        autoResizeMessageInput(input);
        updateCharCounter(input, isOverlay);
      }, 0),
    );
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessageFrom(input);
      }
    });
  });

  dom.messageInput.addEventListener("paste", (event) =>
    handlePasteEvent(event, false),
  );
  dom.overlayMessageInput.addEventListener("paste", (event) =>
    handlePasteEvent(event, true),
  );

  dom.mainScrollBottomBtn.addEventListener("click", () => {
    dom.messages.scrollTo({
      top: dom.messages.scrollHeight,
      behavior: "smooth",
    });
    checkScrollPosition(false);
  });
  dom.overlayScrollBottomBtn.addEventListener("click", () => {
    dom.overlayMessages.scrollTo({
      top: dom.overlayMessages.scrollHeight,
      behavior: "smooth",
    });
    checkScrollPosition(true);
  });

  dom.messages.addEventListener("scroll", () => checkScrollPosition(false), {
    passive: true,
  });
  dom.overlayMessages.addEventListener(
    "scroll",
    () => checkScrollPosition(true),
    { passive: true },
  );

  dom.overlayMessages.addEventListener(
    "wheel",
    (event) => {
      if (!dom.playerFrame.classList.contains("chat-inside-open")) return;
      event.stopPropagation();
    },
    { passive: true },
  );

  window.addEventListener("scroll", syncUnreadBadgesWithVisibility, {
    passive: true,
  });
  window.addEventListener("resize", syncUnreadBadgesWithVisibility, {
    passive: true,
  });
  document.addEventListener("visibilitychange", syncUnreadBadgesWithVisibility);
}

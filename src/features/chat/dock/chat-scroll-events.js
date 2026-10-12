import { dom } from "../../../core/dom.js";
import { logEvent, state } from "../../../core/state.js";
import { CHAT_DOCK_META } from "../../../core/utils.js";
import { autoResizeMessageInput, handlePasteEvent, hideEmojiPicker, normalizeEmojiShortcodesInput, repositionEmojiPicker, submitMessageFrom, toggleEmojiPicker, updateCharCounter, wireFloatingComposerLayout, wireComposerScrollbar } from "../composer/chat-input.js";
import { setReplyTarget } from "../messages/chat-reply.js";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "../messages/unread-counters.js";
import { fillChatHistoryViewport, loadOlderChatHistory } from "../messages/chat-history.js";
import { copyMessageText, hideMessageMenu, showMessageMenu } from "../messages/message-menu.js";
import { setChatDock, setExternalChatAutoExpandEnabled, setInsideChatAutoExpandEnabled, setInsideChatStyle, setInsideChatVisible, syncChatAutoExpandControls, syncExternalChatCollapseHandleOffset, wireResponsiveSessionLayout } from "../chat-layout.js";
import { scheduleMessageTimeAdjustment } from "../messages/message-time-layout.js";
import { focusChatInput } from "../composer/chat-input-focus.js";
import { hideTooltip } from "../../icons-tooltips.js";
import { applyDampenedWheelScroll, clearCollapsePointerHover, handleCollapseButtonClick, hasVerticalScroll, isMobileChatLayout, setCollapsePointerHover, isCollapsePointerHovered, shouldBlockWheelForComposerControl, shouldBlockWheelForContainer, shouldBlockWheelForTextarea } from "../chat-event-helpers.js";

export function wireChatScrollEvents() {
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
dom.messages.addEventListener("scroll", () => {
  if (dom.messages.scrollTop <= 1) void loadOlderChatHistory(dom.messages);
}, { passive: true });

dom.overlayMessages.addEventListener(
  "scroll",
  () => checkScrollPosition(true),
  { passive: true },
);
dom.overlayMessages.addEventListener("scroll", () => {
  if (dom.overlayMessages.scrollTop <= 1) void loadOlderChatHistory(dom.overlayMessages);
}, { passive: true });

dom.overlayMessages.addEventListener(
  "wheel",
  (event) => {
    if (!dom.playerFrame.classList.contains('u-chat-inside-open')) return;
    if (applyDampenedWheelScroll(dom.overlayMessages, event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!shouldBlockWheelForContainer(dom.overlayMessages, event)) return;
    event.preventDefault();
    event.stopPropagation();
  },
  { passive: false },
);

dom.messages.addEventListener(
  "wheel",
  (event) => {
    if (applyDampenedWheelScroll(dom.messages, event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!shouldBlockWheelForContainer(dom.messages, event)) return;
    event.preventDefault();
    event.stopPropagation();
  },
  { passive: false },
);

[dom.replyPreview, dom.overlayReplyPreview].forEach((preview) => {
  preview?.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );
});

[dom.messageInput, dom.overlayMessageInput].forEach((input) => {
  input?.addEventListener(
    "wheel",
    (event) => {
      const form = input.closest("form");
      const messages = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;
      if (!hasVerticalScroll(input) && hasVerticalScroll(messages)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!shouldBlockWheelForTextarea(input, event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );
});

[
  dom.messageEmojiButton,
  dom.overlayEmojiButton,
  dom.mainMessageSend,
  dom.overlayMessageSend,
].forEach((button) => {
  button?.addEventListener(
    "wheel",
    (event) => {
      if (!shouldBlockWheelForComposerControl(button, event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );
});

[dom.mainMessageSend, dom.overlayMessageSend].forEach((button) => {
  const preventSendButtonFocus = (event) => {
    if (!isMobileChatLayout()) return;
    event.preventDefault();
  };
  button?.addEventListener("pointerdown", preventSendButtonFocus);
  button?.addEventListener("mousedown", preventSendButtonFocus);
});
}

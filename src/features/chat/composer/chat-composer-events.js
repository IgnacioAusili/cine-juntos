import { dom } from "../../../core/dom.js";
import { logEvent, state } from "../../../core/state.js";
import { CHAT_DOCK_META } from "../../../core/utils.js";
import { autoResizeMessageInput, handlePasteEvent, hideEmojiPicker, normalizeEmojiShortcodesInput, repositionEmojiPicker, submitMessageFrom, toggleEmojiPicker, updateCharCounter, wireFloatingComposerLayout, wireComposerScrollbar } from "./chat-input.js";
import { setReplyTarget } from "../messages/chat-reply.js";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "../messages/unread-counters.js";
import { fillChatHistoryViewport, loadOlderChatHistory } from "../messages/chat-history.js";
import { copyMessageText, hideMessageMenu, showMessageMenu } from "../messages/message-menu.js";
import { setChatDock, setExternalChatAutoExpandEnabled, setInsideChatAutoExpandEnabled, setInsideChatStyle, setInsideChatVisible, syncChatAutoExpandControls, syncExternalChatCollapseHandleOffset, wireResponsiveSessionLayout } from "../chat-layout.js";
import { scheduleMessageTimeAdjustment } from "../messages/message-time-layout.js";
import { focusChatInput } from "./chat-input-focus.js";
import { hideTooltip } from "../../icons-tooltips.js";
import { applyDampenedWheelScroll, clearCollapsePointerHover, handleCollapseButtonClick, hasVerticalScroll, isMobileChatLayout, setCollapsePointerHover, isCollapsePointerHovered, shouldBlockWheelForComposerControl, shouldBlockWheelForContainer, shouldBlockWheelForTextarea } from "../chat-event-helpers.js";

export function wireChatComposerEvents() {
dom.messageEmojiButton.addEventListener("click", () => {
  if (dom.sessionView?.dataset.chatDock === "bottom") {
    logEvent("mobile-keyboard-debug", `emoji:trigger-click ${JSON.stringify({ button: dom.messageEmojiButton.id, activeElement: document.activeElement?.id || document.activeElement?.tagName || null, inputFocused: document.activeElement === dom.messageInput })}`);
  }
  toggleEmojiPicker(dom.messageInput, dom.messageEmojiButton);
});

dom.overlayEmojiButton.addEventListener("click", () => {
  toggleEmojiPicker(dom.overlayMessageInput, dom.overlayEmojiButton);
});

[dom.emojiPopover].forEach((popover) => {
  popover?.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );

  popover?.addEventListener(
    "touchmove",
    (event) => {
      if (popover.classList.contains('emoji-popover--paged')) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );
});

window.addEventListener(
  "scroll",
  (event) => {
    if (event.target.closest?.(".emoji-popover")) return;
    hideEmojiPicker();
  },
  { passive: true, capture: true },
);
window.addEventListener("resize", repositionEmojiPicker, { passive: true });
window.visualViewport?.addEventListener("resize", repositionEmojiPicker, {
  passive: true,
});

document.addEventListener(
  "pointerdown",
  (event) => {
    if (dom.emojiPopover.hidden) return;
    if (dom.emojiPopover.contains(event.target)) return;
    if (event.target.closest('.icon-button--emoji-trigger')) return;

    const activeEmojiInput = state.ui.activeEmojiInput;
    hideEmojiPicker();
    if (activeEmojiInput && !isMobileChatLayout()) {
      window.requestAnimationFrame(() => {
        focusChatInput(activeEmojiInput);
      });
    }
    event.preventDefault();
  },
  true,
);

document.addEventListener("click", (event) => {
  if (dom.emojiPopover.hidden) return;
  if (dom.emojiPopover.contains(event.target)) return;
  if (event.target.closest('.icon-button--emoji-trigger')) return;
  hideEmojiPicker();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || dom.emojiPopover.hidden) return;
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
  if (action === "reply") setReplyTarget(state.chat.menuMessage, state.chat.menuReplyInput);
  hideMessageMenu();
});

dom.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (dom.sessionView?.dataset.chatDock === "bottom") {
    logEvent("mobile-keyboard-debug", `submit:event ${JSON.stringify({ form: dom.messageForm.id, submitter: event.submitter?.id || null, activeElement: document.activeElement?.id || document.activeElement?.tagName || null, source: "main-form" })}`);
  }
  submitMessageFrom(dom.messageInput);
});

dom.overlayMessageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitMessageFrom(dom.overlayMessageInput);
});

[dom.messageInput, dom.overlayMessageInput].forEach((input) => {
  const isOverlay = input === dom.overlayMessageInput;
  wireComposerScrollbar(input);
  input.addEventListener("input", () => {
    normalizeEmojiShortcodesInput(input);
    autoResizeMessageInput(input);
    updateCharCounter(input, isOverlay);
  });
  input.addEventListener("paste", () =>
    window.setTimeout(() => {
      normalizeEmojiShortcodesInput(input);
      autoResizeMessageInput(input);
      updateCharCounter(input, isOverlay);
    }, 0),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (input === dom.messageInput && dom.sessionView?.dataset.chatDock === "bottom") {
        logEvent("mobile-keyboard-debug", `submit:enter ${JSON.stringify({ input: input.id, activeElement: document.activeElement?.id || document.activeElement?.tagName || null, isComposing: event.isComposing, valueLength: input.value.length })}`);
      }
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
}

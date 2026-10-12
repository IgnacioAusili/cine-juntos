import { dom } from "../../../core/dom.js";
import { logEvent, state } from "../../../core/state.js";
import { CHAT_DOCK_META } from "../../../core/utils.js";
import { autoResizeMessageInput, handlePasteEvent, hideEmojiPicker, normalizeEmojiShortcodesInput, repositionEmojiPicker, submitMessageFrom, toggleEmojiPicker, updateCharCounter, wireFloatingComposerLayout, wireComposerScrollbar } from "../composer/chat-input.js";
import { setReplyTarget } from "../messages/chat-reply.js";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "../messages/unread-counters.js";
import { fillChatHistoryViewport, loadOlderChatHistory } from "../messages/chat-history.js";
import { copyMessageText, hideMessageMenu, showMessageMenu } from "../messages/message-menu.js";
import { captureExternalChatCollapseScroll, setChatDock, setExternalChatAutoExpandEnabled, setInsideChatAutoExpandEnabled, setInsideChatStyle, setInsideChatVisible, syncChatAutoExpandControls, syncExternalChatCollapseHandleOffset, wireResponsiveSessionLayout } from "../chat-layout.js";
import { scheduleMessageTimeAdjustment } from "../messages/message-time-layout.js";
import { focusChatInput } from "../composer/chat-input-focus.js";
import { hideTooltip } from "../../icons-tooltips.js";
import { applyDampenedWheelScroll, clearCollapsePointerHover, handleCollapseButtonClick, hasVerticalScroll, isMobileChatLayout, setCollapsePointerHover, isCollapsePointerHovered, shouldBlockWheelForComposerControl, shouldBlockWheelForContainer, shouldBlockWheelForTextarea } from "../chat-event-helpers.js";

export function wireChatLayoutEvents() {
syncChatAutoExpandControls();
wireResponsiveSessionLayout();
wireFloatingComposerLayout();

if ("ResizeObserver" in window && dom.workspace) {
  let pendingHandleSync = 0;
  const chatHandleResizeObserver = new ResizeObserver(() => {
    if (dom.sessionView?.classList.contains('session-view--chat-layout-transitioning') || pendingHandleSync) return;
    pendingHandleSync = window.requestAnimationFrame(() => {
      pendingHandleSync = 0;
      syncExternalChatCollapseHandleOffset();
    });
  });
  chatHandleResizeObserver.observe(dom.workspace);
  if (dom.videoArea) {
    chatHandleResizeObserver.observe(dom.videoArea);
  }
  if (dom.playerFrame) {
    chatHandleResizeObserver.observe(dom.playerFrame);
  }
}
window.addEventListener("chat-layout-settled", syncExternalChatCollapseHandleOffset, { passive: true });
window.addEventListener("chat-layout-settled", clearCollapsePointerHover, { passive: true });
window.addEventListener("chat-layout-settled", () => {
  void fillChatHistoryViewport();
}, { passive: true });
window.addEventListener("scroll", syncExternalChatCollapseHandleOffset, { passive: true });
window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);

dom.insideChatAutoExpandSwitch.addEventListener("click", () => {
  setInsideChatAutoExpandEnabled(!state.chat.autoExpandInsideEnabled);
});

dom.externalChatAutoExpandSwitch.addEventListener("click", () => {
  setExternalChatAutoExpandEnabled(!state.chat.autoExpandExternalEnabled);
});

dom.chatStyleToggle.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chat-style]");
  if (!button) return;
  setInsideChatStyle(button.dataset.chatStyle);
});

dom.playerChatToggleButton.addEventListener("click", () => {
  setInsideChatVisible(
    !dom.playerFrame.classList.contains('u-chat-inside-open'),
  );
});

dom.closeInsideChatButton.addEventListener("click", () => {
  setInsideChatVisible(false);
});

dom.dockChatButton.addEventListener("click", () => {
  const currentDock = dom.sessionView.dataset.chatDock || "right";
  setChatDock(CHAT_DOCK_META[currentDock]?.next || "right");
});

[dom.collapseChatButton, dom.expandChatButton].filter(Boolean).forEach((button) => {
  const hoverTarget = button.closest('.chat-area__collapse-hover-zone') || button;
  hoverTarget.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    if (dom.sessionView?.classList.contains('session-view--chat-collapsed')) {
      if (button !== dom.expandChatButton) return;
    } else if (button !== dom.collapseChatButton) {
      return;
    }
    setCollapsePointerHover(button);
  });
  hoverTarget.addEventListener("pointerleave", () => {
    if (isCollapsePointerHovered(button)) clearCollapsePointerHover();
  });

  button.addEventListener("pointerdown", (event) => {
    hideTooltip(true);
    dom.collapseChatButton?.blur();
    dom.expandChatButton?.blur();
    captureExternalChatCollapseScroll();
    event.preventDefault();
  });

  button.addEventListener("focus", () => {
    button.blur();
  });

  button.addEventListener("click", handleCollapseButtonClick);
});

[
  [dom.messageEmojiButton, dom.messageInput],
  [dom.overlayEmojiButton, dom.overlayMessageInput],
].forEach(([button, input]) => {
  const preserveInputFocus = (event) => event.preventDefault();
  button?.addEventListener("pointerdown", preserveInputFocus);
  button?.addEventListener("mousedown", preserveInputFocus);
  button?.addEventListener("focus", () => {
    if (isMobileChatLayout()) button.blur();
  });
});
}

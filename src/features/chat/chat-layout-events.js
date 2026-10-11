import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { logEvent, state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { CHAT_DOCK_META } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { autoResizeMessageInput, handlePasteEvent, hideEmojiPicker, normalizeEmojiShortcodesInput, repositionEmojiPicker, submitMessageFrom, toggleEmojiPicker, updateCharCounter, wireFloatingComposerLayout, wireComposerScrollbar } from "./chat-input.js?v=20261011-chat-ui-fixes-03";
import { setReplyTarget } from "./chat-reply.js?v=20261011-chat-ui-fixes-03";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "./unread-counters.js?v=20261011-chat-interaction-fixes-01";
import { fillChatHistoryViewport, loadOlderChatHistory } from "./chat-history.js?v=20261011-chat-ui-fixes-03";
import { copyMessageText, hideMessageMenu, showMessageMenu } from "./message-menu.js?v=20261010-file-size-refactor-02";
import { captureExternalChatCollapseScroll, setChatDock, setExternalChatAutoExpandEnabled, setInsideChatAutoExpandEnabled, setInsideChatStyle, setInsideChatVisible, syncChatAutoExpandControls, syncExternalChatCollapseHandleOffset, wireResponsiveSessionLayout } from "./chat-layout.js?v=20261011-chat-ui-fixes-03";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20261010-file-size-refactor-02";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261011-chat-ui-fixes-03";
import { applyDampenedWheelScroll, clearCollapsePointerHover, handleCollapseButtonClick, hasVerticalScroll, isMobileChatLayout, setCollapsePointerHover, isCollapsePointerHovered, shouldBlockWheelForComposerControl, shouldBlockWheelForContainer, shouldBlockWheelForTextarea } from "./chat-event-helpers.js?v=20261011-chat-ui-fixes-03";

export function wireChatLayoutEvents() {
syncChatAutoExpandControls();
wireResponsiveSessionLayout();
wireFloatingComposerLayout();

if ("ResizeObserver" in window && dom.workspace) {
  let pendingHandleSync = 0;
  const chatHandleResizeObserver = new ResizeObserver(() => {
    if (dom.sessionView?.classList.contains("chat-layout-transitioning") || pendingHandleSync) return;
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

[dom.collapseChatButton, dom.expandChatButton].filter(Boolean).forEach((button) => {
  const hoverTarget = button.closest(".chat-collapse-hover-zone") || button;
  hoverTarget.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    if (dom.sessionView?.classList.contains("chat-collapsed")) {
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

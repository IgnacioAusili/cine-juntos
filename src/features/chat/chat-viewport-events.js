import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { logEvent, state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { CHAT_DOCK_META } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { autoResizeMessageInput, handlePasteEvent, hideEmojiPicker, normalizeEmojiShortcodesInput, repositionEmojiPicker, submitMessageFrom, toggleEmojiPicker, updateCharCounter, wireFloatingComposerLayout, wireComposerScrollbar } from "./chat-input.js?v=20261010-file-size-refactor-02";
import { setReplyTarget } from "./chat-reply.js?v=20261010-file-size-refactor-02";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "./unread-counters.js?v=20261010-file-size-refactor-02";
import { fillChatHistoryViewport, loadOlderChatHistory } from "./chat-history.js?v=20261010-file-size-refactor-02";
import { copyMessageText, hideMessageMenu, showMessageMenu } from "./message-menu.js?v=20261010-file-size-refactor-02";
import { setChatDock, setExternalChatAutoExpandEnabled, setInsideChatAutoExpandEnabled, setInsideChatStyle, setInsideChatVisible, syncChatAutoExpandControls, syncExternalChatCollapseHandleOffset, wireResponsiveSessionLayout } from "./chat-layout.js?v=20261010-file-size-refactor-02";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20261010-file-size-refactor-02";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { applyDampenedWheelScroll, clearCollapsePointerHover, handleCollapseButtonClick, hasVerticalScroll, isMobileChatLayout, setCollapsePointerHover, isCollapsePointerHovered, shouldBlockWheelForComposerControl, shouldBlockWheelForContainer, shouldBlockWheelForTextarea } from "./chat-event-helpers.js?v=20261010-file-size-refactor-02";

export function wireChatViewportEvents() {
window.addEventListener("scroll", syncUnreadBadgesWithVisibility, {
  passive: true,
});
window.addEventListener("resize", syncUnreadBadgesWithVisibility, {
  passive: true,
});
window.addEventListener("resize", () => {
  void fillChatHistoryViewport();
}, { passive: true });
window.addEventListener("resize", syncExternalChatCollapseHandleOffset, {
  passive: true,
});
window.addEventListener("resize", scheduleMessageTimeAdjustment, {
  passive: true,
});
window.addEventListener("load", scheduleMessageTimeAdjustment, { once: true });
document.addEventListener("visibilitychange", syncUnreadBadgesWithVisibility);
}

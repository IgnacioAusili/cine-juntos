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

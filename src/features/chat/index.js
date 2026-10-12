export {
  buildEmojiPicker,
  updateCharCounter,
  sendMessage,
} from "./composer/chat-input.js";
export {
  beginSystemMessageHydration,
  finishSystemMessageHydration,
  renderMessage,
} from "./messages/chat-render.js";
export {
  fillChatHistoryViewport,
  loadOlderChatHistory,
  resetChatHistoryPaging,
} from "./messages/chat-history.js";
export {
  clearReplyTarget,
  renderReplyPreview,
  scrollToMessage,
  setReplyTarget,
} from "./messages/chat-reply.js";
export { sendVideoEventMessage } from "./system-messages/chat-system-messages.js";
export {
  checkScrollPosition,
  resetInsideUnread,
  resetPageUnread,
} from "./messages/unread-counters.js";
export {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./messages/message-menu.js";
export {
  getPersistedInsideChatStyle,
  restoreExternalChatCollapsed,
  scrollToVideoPosition,
  setChatDock,
  setExternalChatAutoExpandEnabled,
  setExternalChatCollapsed,
  setInsideChatAutoExpandEnabled,
  setInsideChatStyle,
  setInsideChatVisible,
  syncChatAutoExpandControls,
  updateCollapseButton,
} from "./chat-layout.js";

export { wireChatEvents } from "./chat-events.js";

import { wireChatLayoutEvents } from "./chat-layout-events.js?v=20261011-chat-ui-fixes-03";
import { wireChatComposerEvents } from "./chat-composer-events.js?v=20261011-chat-ui-fixes-03";
import { wireChatScrollEvents } from "./chat-scroll-events.js?v=20261011-chat-ui-fixes-03";
import { wireChatViewportEvents } from "./chat-viewport-events.js?v=20261011-chat-ui-fixes-03";

export function wireChatEvents() {
  wireChatLayoutEvents();
  wireChatComposerEvents();
  wireChatScrollEvents();
  wireChatViewportEvents();
}

import { wireChatLayoutEvents } from "./chat-layout-events.js?v=20261011-overlay-scroll-top-01";
import { wireChatComposerEvents } from "./chat-composer-events.js?v=20261011-overlay-scroll-top-01";
import { wireChatScrollEvents } from "./chat-scroll-events.js?v=20261011-overlay-scroll-top-01";
import { wireChatViewportEvents } from "./chat-viewport-events.js?v=20261011-overlay-scroll-top-01";

export function wireChatEvents() {
  wireChatLayoutEvents();
  wireChatComposerEvents();
  wireChatScrollEvents();
  wireChatViewportEvents();
}

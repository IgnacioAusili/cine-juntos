import { wireChatLayoutEvents } from "./dock/chat-layout-events.js";
import { wireChatComposerEvents } from "./composer/chat-composer-events.js";
import { wireChatScrollEvents } from "./dock/chat-scroll-events.js";
import { wireChatViewportEvents } from "./dock/chat-viewport-events.js";

export function wireChatEvents() {
  wireChatLayoutEvents();
  wireChatComposerEvents();
  wireChatScrollEvents();
  wireChatViewportEvents();
}

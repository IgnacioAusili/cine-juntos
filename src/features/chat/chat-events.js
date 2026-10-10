import { wireChatLayoutEvents } from "./chat-layout-events.js?v=20261010-file-size-refactor-02";
import { wireChatComposerEvents } from "./chat-composer-events.js?v=20261010-file-size-refactor-02";
import { wireChatScrollEvents } from "./chat-scroll-events.js?v=20261010-file-size-refactor-02";
import { wireChatViewportEvents } from "./chat-viewport-events.js?v=20261010-file-size-refactor-02";

export function wireChatEvents() {
  wireChatLayoutEvents();
  wireChatComposerEvents();
  wireChatScrollEvents();
  wireChatViewportEvents();
}

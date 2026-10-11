import { wireChatLayoutEvents } from "./chat-layout-events.js?v=20261011-bem-itcss-oocss-04";
import { wireChatComposerEvents } from "./chat-composer-events.js?v=20261011-bem-itcss-oocss-04";
import { wireChatScrollEvents } from "./chat-scroll-events.js?v=20261011-bem-itcss-oocss-04";
import { wireChatViewportEvents } from "./chat-viewport-events.js?v=20261011-bem-itcss-oocss-04";

export function wireChatEvents() {
  wireChatLayoutEvents();
  wireChatComposerEvents();
  wireChatScrollEvents();
  wireChatViewportEvents();
}

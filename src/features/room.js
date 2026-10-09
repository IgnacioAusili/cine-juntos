// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js?v=20261008";

export { joinRoom } from "./room-entry.js?v=20261009-system-message-catchup-03-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";
export { wireRoomEvents } from "./room-events.js?v=20261009-system-message-catchup-03-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";
export { copyInvite } from "./room-invite.js?v=20261009-invite-copy-animation-queue-01";
export { leaveRoom } from "./room-exit.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

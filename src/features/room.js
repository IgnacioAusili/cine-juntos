// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js?v=20261008";

export { joinRoom } from "./room-entry.js?v=20261009-bottom-chat-expand-center-02";
export { wireRoomEvents } from "./room-events.js?v=20261009-room-back-slide-02";
export { copyInvite } from "./room-invite.js?v=20261009-invite-copy-animation-queue-01";
export { leaveRoom } from "./room-exit.js?v=20261009-bottom-chat-expand-center-02";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

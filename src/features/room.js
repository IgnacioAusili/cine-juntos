// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js?v=20261008";

export { joinRoom } from "./room-entry.js?v=20261009-emoji-reply-settle-01";
export { wireRoomEvents } from "./room-events.js?v=20261009-emoji-reply-settle-01";
export { copyInvite } from "./room-invite.js?v=20261008";
export { leaveRoom } from "./room-exit.js?v=20261009-emoji-reply-settle-01";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

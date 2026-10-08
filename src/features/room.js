// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js?v=20261004-room-join-race-01";

export { joinRoom } from "./room-entry.js?v=20261004-room-join-race-01-seek-tooltip-stable-01-bottom-chat-first-paint-01-bottom-chat-switch-measure-01";
export { wireRoomEvents } from "./room-events.js?v=20261004-room-join-race-01-seek-tooltip-stable-01-bottom-chat-first-paint-01-bottom-chat-switch-measure-01";
export { copyInvite } from "./room-invite.js?v=20261004-room-join-race-01";
export { leaveRoom } from "./room-exit.js?v=20261004-room-join-race-01-bottom-chat-switch-measure-01";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

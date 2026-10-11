// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js?v=20261011-chat-controls-repair-01";

export { joinRoom } from "./room-entry.js?v=20261011-player-empty-state-01";
export { wireRoomEvents } from "./room-events.js?v=20261011-player-empty-state-01";
export { copyInvite } from "./room-invite.js?v=20261011-chat-controls-repair-01";
export { leaveRoom } from "./room-exit.js?v=20261011-chat-auto-switch-bem-01-video-ts-group-01";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

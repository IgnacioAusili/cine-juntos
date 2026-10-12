// API pública de las funciones de sala.
import { removeActiveTabRecord } from "./room-access.js";

export { joinRoom } from "./room-entry.js";
export { wireRoomEvents } from "./room-events.js";
export { copyInvite } from "./room-invite.js";
export { leaveRoom } from "./room-exit.js";

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

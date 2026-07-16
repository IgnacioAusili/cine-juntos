// Punto de entrada: inicializa la app y conecta los modulos principales.
import {
  dom,
} from "./core/dom.js";
import {
  state,
  applyInitialDefaults,
  detectTerminalLogEndpoint,
  logEvent,
} from "./core/state.js";
import {
  normalizeRoomCode,
} from "./core/utils.js";
import {
  hydrateIcons,
  initializeUi,
  setConnection,
} from "./features/ui.js";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js";
import {
  showLobby,
} from "./features/session-ui.js";
import {
  buildEmojiPicker,
  setInsideChatStyle,
  setInsideChatVisible,
  setChatDock,
  updateCollapseButton,
  updateCharCounter,
  wireChatEvents,
} from "./features/chat.js";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/playerSync.js";
import { joinRoom, wireRoomEvents } from "./features/room.js";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

applyInitialDefaults();
initializeUi();
renderPresence();
wireRoomEvents();
wireIdentityEvents();
wireChatEvents();
wirePlayerEvents();
buildEmojiPicker();
initializePlayer();
setInsideChatStyle("float");
setInsideChatVisible(false);
setChatDock(localStorage.getItem("cine-juntos-chat-dock") || "right");
updateCollapseButton();
updateCharCounter(dom.messageInput, false);
updateCharCounter(dom.overlayMessageInput, true);
window.addEventListener("load", hydrateIcons);
detectTerminalLogEndpoint();

window.addEventListener("pagehide", () => {
  if (state.session.transport) {
    state.session.transport.close();
  }
});

window.addEventListener("beforeunload", () => {
  if (state.session.transport) {
    state.session.transport.close();
  }
});

if (requestedRoom) {
  dom.roomInput.value = requestedRoom;
  joinRoom(requestedRoom);
} else {
  setConnection("local", "Modo local");
  showLobby();
}

logEvent("app", "Interfaz lista. Video de ejemplo precargado.");

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
} from "./features/icons-tooltips.js?v=20260823-lobby-help-name-01";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20260823-name-input-bounds-04";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js";
import {
  buildEmojiPicker,
  getPersistedInsideChatStyle,
  setInsideChatStyle,
  setInsideChatVisible,
  setChatDock,
  syncChatAutoExpandControls,
  updateCollapseButton,
  updateCharCounter,
  wireChatEvents,
} from "./features/chat/index.js?v=20260823-system-message-drum-09";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20260819-chat-overlay-controls-01";
import { joinRoom, wireRoomEvents } from "./features/room.js?v=20260823-lobby-name-01";
import {
  showSlowLoadDialog,
} from "./features/session-ui.js";
import {
  EXAMPLE_VIDEO_URL,
} from "./core/utils.js";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");
const isSlowLoadDialogTest = new URLSearchParams(window.location.search).get("slowLoadDialogTest") === "1";

document.body.classList.remove("app-ready");
applyInitialDefaults();
wireLayoutMetrics();
initializeUi();
initializeAboutDialog();
renderPresence();
wireRoomEvents();
wireIdentityEvents();
wireChatEvents();
wirePlayerEvents();
buildEmojiPicker();
initializePlayer();
setInsideChatStyle(getPersistedInsideChatStyle());
setInsideChatVisible(false);
setChatDock(localStorage.getItem("cine-juntos-chat-dock") || "right");
syncChatAutoExpandControls();
updateCollapseButton();
updateCharCounter(dom.messageInput, false);
updateCharCounter(dom.overlayMessageInput, true);
window.addEventListener("load", hydrateIcons);
window.addEventListener("load", () => {
  document.body.classList.add("app-ready");
});
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
  dom.roomInput.dispatchEvent(new Event("input", { bubbles: true }));
} else {
  setConnection("local", "Modo local");
  showLobby();
}

if (requestedRoom) {
  window.addEventListener(
    "load",
    () => {
      void joinRoom(requestedRoom);
    },
    { once: true },
  );
}

if (isSlowLoadDialogTest) {
  window.addEventListener(
    "load",
    () => {
      dom.videoUrlInput.value = EXAMPLE_VIDEO_URL;
      void showSlowLoadDialog(
        "Escenario de prueba: el video parece estar tardando en cargar. ¿Quieres intentar recargarlo solo para ti?",
      );
    },
    { once: true },
  );
}

logEvent("app", "Interfaz lista. Video de ejemplo precargado.");

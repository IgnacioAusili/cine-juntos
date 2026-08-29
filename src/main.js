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
} from "./features/icons-tooltips.js?v=20260828-mobile-help-tooltip-01";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20260826-bottom-name-input-05";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js?v=20260827-entry-scroll-fix-01";
import {
  buildEmojiPicker,
  getPersistedInsideChatStyle,
  setInsideChatStyle,
  setInsideChatVisible,
  setChatDock,
  restoreExternalChatCollapsed,
  syncChatAutoExpandControls,
  updateCollapseButton,
  updateCharCounter,
  wireChatEvents,
} from "./features/chat/index.js?v=20260828-mobile-chat-expand-fix-01";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20260829-video-source-sync-01";
import { joinRoom, wireRoomEvents } from "./features/room.js?v=20260827-entry-video-focus-02";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

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
setChatDock(localStorage.getItem("cine-juntos-chat-dock") || "right", {
  skipTransition: true,
  preserveScroll: true,
});
restoreExternalChatCollapsed();
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

logEvent("app", "Interfaz lista. Video de ejemplo precargado.");

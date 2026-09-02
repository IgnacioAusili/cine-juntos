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
} from "./features/icons-tooltips.js?v=20260829-touch-tooltip-fix-04";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js?v=20260902-mobile-viewport-lock-02";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20260901-chat-arrow-unified-03";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js?v=20260902-stable-page-viewport-01";
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
} from "./features/chat/index.js?v=20260902-chat-landscape-handle-settle-01";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20260902-video-scroll-touch-02";
import { wireMobileFullscreenOrientation } from "./features/player/mobile-fullscreen-orientation.js";
import { wireMobileKeyboardLayout } from "./features/chat/mobile-keyboard.js";
import { wireMobileBottomChatHeader } from "./features/chat/mobile-chat-header.js?v=20260830-mobile-chat-header-fix-04";
import { joinRoom, wireRoomEvents } from "./features/room.js?v=20260902-chat-landscape-handle-settle-01";
import { wireTouchHover } from "./core/touch-interactions.js?v=20260829-touch-hold-fix-01";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

document.body.classList.remove("app-ready");
applyInitialDefaults();
wireLayoutMetrics();
initializeUi();
initializeAboutDialog();
renderPresence();
wireRoomEvents();
wireTouchHover(dom.createRoomButton);
wireTouchHover(dom.joinRoomButton);
wireTouchHover(dom.copyInviteButton, {
  onDeactivate: () => dom.copyInviteButton?.blur(),
});
wireTouchHover(dom.backToLobbyButton, {
  delay: 0,
  onDeactivate: () => dom.backToLobbyButton?.blur(),
});
wireTouchHover(dom.aboutButton, {
  // Este botón debe reflejar el touch desde que comienza, no después de una
  // pulsación larga; el estado se limpia al soltar.
  delay: 0,
  // En móvil el botón puede quedar enfocado tras tocarlo y conservar el
  // estilo de :focus-visible aunque ya haya terminado la pulsación.
  onDeactivate: () => dom.aboutButton?.blur(),
});
wireIdentityEvents();
wireChatEvents();
wireMobileKeyboardLayout();
wirePlayerEvents();
wireMobileFullscreenOrientation();
buildEmojiPicker();
initializePlayer();
setInsideChatStyle(getPersistedInsideChatStyle());
setInsideChatVisible(false);
setChatDock(localStorage.getItem("cine-juntos-chat-dock") || "right", {
  skipTransition: true,
  preserveScroll: true,
});
restoreExternalChatCollapsed();
wireMobileBottomChatHeader();
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

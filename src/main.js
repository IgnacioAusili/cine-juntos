// Punto de entrada: inicializa la app y conecta los modulos principales.
import {
  dom,
} from "./core/dom.js";
import {
  state,
  applyInitialDefaults,
  detectTerminalLogEndpoint,
  logEvent,
} from "./core/state.js?v=20261008";
import {
  normalizeRoomCode,
} from "./core/utils.js";
import {
  hydrateIcons,
  initializeUi,
  setConnection,
} from "./features/icons-tooltips.js?v=20261008";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js?v=20261008";
import { wireLobbyKeyboardRestore } from "./features/lobby-keyboard.js?v=20261008";
import { wireAboutDialogScrollbar } from "./features/about-dialog-scrollbar.js?v=20261008";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20261008";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js?v=20261008";
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
} from "./features/chat/index.js?v=20261009-image-reply-edge-02";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20261009-image-reply-edge-02";
import { wireMobileFullscreenOrientation } from "./features/player/mobile-fullscreen-orientation.js";
import { wireMobileChatKeyboardControls } from "./features/player/mobile-chat-keyboard-controls.js?v=20261008";
import { wireMobileBottomChatHeader } from "./features/chat/mobile-chat-header.js?v=20261008";
import { wireMobileLandscapeVideoSnap } from "./features/mobile-landscape-video-snap.js?v=20261008";
import { joinRoom, wireRoomEvents } from "./features/room.js?v=20261008";
import { wireTouchHover } from "./core/touch-interactions.js?v=20261008";
import { installConsoleLogCapture, wireMobileDebugTools } from "./features/mobile-debug.js?v=20261008";
import { wireMobileKeyboardDiagnostics } from "./features/mobile-keyboard-diagnostics.js?v=20261008";
import { openDialogTestRoute } from "./features/dialog-test-routes.js?v=20261009-image-pan-01";
import { wireLobbyLayoutVariants } from "./features/lobby-layout-variants.js?v=20261008";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

installConsoleLogCapture();

document.body.classList.remove("app-ready");
applyInitialDefaults();
wireLobbyLayoutVariants();
wireLayoutMetrics();
wireLobbyKeyboardRestore();
initializeUi();
initializeAboutDialog();
wireAboutDialogScrollbar();
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
wireTouchHover(dom.editNameButton, { delay: 0 });
wireTouchHover(dom.confirmNameButton, { delay: 0 });
wireChatEvents();
wirePlayerEvents();
wireMobileChatKeyboardControls();
wireMobileFullscreenOrientation();
wireMobileLandscapeVideoSnap();
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
wireMobileDebugTools();
wireMobileKeyboardDiagnostics();
syncChatAutoExpandControls();
updateCollapseButton();
updateCharCounter(dom.messageInput, false);
updateCharCounter(dom.overlayMessageInput, true);
window.addEventListener("load", hydrateIcons);
window.addEventListener("load", openDialogTestRoute, { once: true });
window.addEventListener("load", () => {
  document.body.classList.add("app-ready");
});
if (window.CINE_JUNTOS_TERMINAL_LOGS) {
  detectTerminalLogEndpoint();
}

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

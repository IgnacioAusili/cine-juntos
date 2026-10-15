// Punto de entrada: inicializa la app y conecta los modulos principales.
import "../public/firebase-config.js";

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
} from "./features/icons-tooltips.js";
import {
  wireLayoutMetrics,
} from "./features/layout/index.js";
import { wireLobbyKeyboardRestore } from "./features/lobby/lobby-keyboard.js";
import { wireLobbyAppInstall } from "./features/lobby/lobby-app-install.js";
import { wireAboutDialogScrollbar } from "./features/about-dialog-scrollbar.js";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence/index.js";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session/session-ui.js";
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
} from "./features/chat/index.js";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js";
import { wireMobileFullscreenOrientation } from "./features/player/fullscreen/mobile-fullscreen-orientation.js";
import { wireMobileChatKeyboardControls } from "./features/player/mobile-chat-keyboard-controls.js";
import { wireMobileBottomChatHeader } from "./features/chat/dock/mobile-chat-header.js";
import { wireMobileLandscapeVideoSnap } from "./features/player/mobile-landscape-video-snap.js";
import { joinRoom, wireRoomEvents } from "./features/room/index.js";
import { wireTouchHover } from "./core/touch-interactions.js";
import { installConsoleLogCapture, wireMobileDebugTools } from "./features/diagnostics/mobile-debug.js";
import { wireMobileKeyboardDiagnostics } from "./features/diagnostics/mobile-keyboard-diagnostics.js";
import { openDialogTestRoute } from "./features/dialog-test-routes.js";
import { wireLobbyLayoutVariants } from "./features/lobby/lobby-layout-variants.js";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

installConsoleLogCapture();
wireLobbyAppInstall();

document.body.classList.remove('page-context--ready');
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
  document.body.classList.add('page-context--ready');
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

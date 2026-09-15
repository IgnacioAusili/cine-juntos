// Punto de entrada: inicializa la app y conecta los modulos principales.
import {
  dom,
} from "./core/dom.js";
import {
  state,
  applyInitialDefaults,
  detectTerminalLogEndpoint,
  logEvent,
} from "./core/state.js?v=20260914-console-log-controls-01";
import {
  normalizeRoomCode,
} from "./core/utils.js";
import {
  hydrateIcons,
  initializeUi,
  setConnection,
} from "./features/icons-tooltips.js?v=20260914-tooltip-single-path-01";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js?v=20260913-bottom-chat-keyboard-arrow-fixed-04";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20260913-name-confirm-icon-01";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js?v=20260911-orientation-scroll-anchor-01";
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
} from "./features/chat/index.js?v=20260915-desktop-emoji-focus-02";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20260915-desktop-emoji-focus-01";
import { wireMobileFullscreenOrientation } from "./features/player/mobile-fullscreen-orientation.js";
import { wireMobileChatKeyboardControls } from "./features/player/mobile-chat-keyboard-controls.js?v=20260914-keyboard-player-controls-01";
import { wireMobileBottomChatHeader } from "./features/chat/mobile-chat-header.js?v=20260913-name-editor-keyboard-header-02";
import { wireMobileLandscapeVideoSnap } from "./features/mobile-landscape-video-snap.js?v=20260910-mobile-portrait-no-snap-01";
import { joinRoom, wireCopyAnimationDiagnostics, wireRoomEvents } from "./features/room.js?v=20260915-desktop-emoji-focus-01";
import { wireTouchHover } from "./core/touch-interactions.js?v=20260829-touch-hold-fix-01";
import { installConsoleLogCapture, wireMobileDebugTools } from "./features/mobile-debug.js?v=20260915-log-dialog-ui-01";
import { wireMobileKeyboardDiagnostics } from "./features/mobile-keyboard-diagnostics.js?v=20260911-ios-landscape-keyboard-diagnostics-01";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");

installConsoleLogCapture();

document.body.classList.remove("app-ready");
applyInitialDefaults();
wireLayoutMetrics();
initializeUi();
initializeAboutDialog();
renderPresence();
wireRoomEvents();
wireCopyAnimationDiagnostics();
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

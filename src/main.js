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
} from "./features/icons-tooltips.js?v=20260914-tooltip-single-path-01-tooltip-focus-restore-skip-01";
import {
  wireLayoutMetrics,
} from "./features/layout-metrics.js?v=20261002-bottom-chat-header-flow-focus-01";
import { wireLobbyKeyboardRestore } from "./features/lobby-keyboard.js?v=20260917-native-keyboard-flow-01";
import { wireAboutDialogScrollbar } from "./features/about-dialog-scrollbar.js?v=20260917-visual-scrollbar-05";
import {
  renderPresence,
  wireIdentityEvents,
} from "./features/presence.js?v=20261003-name-editor-curtain-cancel-esc-blur-03";
import {
  showLobby,
  initializeAboutDialog,
} from "./features/session-ui.js?v=20261003-about-dialog-curtain-copy-move-17";
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
} from "./features/chat/index.js?v=20261003-name-editor-curtain-cancel-esc-blur-03-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-16-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01-aspect-dock-settle-01-collapsed-responsive-resize-01-collapse-arrow-tooltip-01-composer-width-01";
import {
  initializePlayer,
  wirePlayerEvents,
} from "./features/player/index.js?v=20261003-desktop-video-snap-center-01-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-16-video-snap-10px-fullscreen-bleed-01-seek-tooltip-stable-01-header-landscape-compact-01-component-stack-header-pc-gutter-01-component-stack-header-pc-gutter-02-component-stack-header-input-mode-01-component-stack-header-measured-gutter-01-component-stack-header-edge-geometry-02-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01-composer-width-01";
import { wireMobileFullscreenOrientation } from "./features/player/mobile-fullscreen-orientation.js";
import { wireMobileChatKeyboardControls } from "./features/player/mobile-chat-keyboard-controls.js?v=20260914-keyboard-player-controls-01";
import { wireMobileBottomChatHeader } from "./features/chat/mobile-chat-header.js?v=20260913-name-editor-keyboard-header-02-tooltip-focus-restore-skip-01-dock-switch-handle-reveal-03";
import { wireMobileLandscapeVideoSnap } from "./features/mobile-landscape-video-snap.js?v=20260910-mobile-portrait-no-snap-01";
import { joinRoom, wireRoomEvents } from "./features/room.js?v=20261004-room-join-race-01-seek-tooltip-stable-01-bottom-chat-first-paint-02-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01-aspect-dock-settle-01-collapsed-responsive-resize-01-composer-width-01";
import { wireTouchHover } from "./core/touch-interactions.js?v=20260829-touch-hold-fix-01";
import { installConsoleLogCapture, wireMobileDebugTools } from "./features/mobile-debug.js?v=20260917-dialog-test-routes-01";
import { wireMobileKeyboardDiagnostics } from "./features/mobile-keyboard-diagnostics.js?v=20260911-ios-landscape-keyboard-diagnostics-01";
import { openDialogTestRoute } from "./features/dialog-test-routes.js?v=20261003-desktop-video-snap-center-01-video-snap-10px-fullscreen-bleed-01-seek-tooltip-stable-01-lightbox-initial-zoom-reset-01-room-scroll-lock-01-native-modal-scroll-lock-01-component-stack-header-pc-gutter-02-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01-composer-width-01";
import { wireLobbyLayoutVariants } from "./features/lobby-layout-variants.js?v=20261003-marquee-random-phrase-pool-seamless-live-premiere-05-selected-copy-01-marquee-pause-offscreen-step-boundary-02";

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

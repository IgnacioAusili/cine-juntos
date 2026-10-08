import { dom } from "../core/dom.js";
import {
  state,
  getDisplayName,
  logEvent,
} from "../core/state.js?v=20260914-console-log-controls-01";
import { MAX_ROOM_PARTICIPANTS } from "../core/utils.js";
import { createTransport } from "../services/transport.js?v=20260912-name-session-01";
import {
  renderMembers,
  renderPresence,
} from "./presence.js?v=20261003-name-editor-curtain-cancel-esc-blur-03";
import { setConnection } from "./icons-tooltips.js?v=20260914-tooltip-single-path-01-tooltip-focus-restore-skip-01";
import { syncComponentAspectLayoutNow } from "./chat/component-aspect-layout.js?v=20261007-bottom-chat-switch-measure-01";
import {
  getUserScrollIntentVersion,
  setHostBadge,
  setSyncStatus,
  showLobby,
  showSession,
  watchRoomEntryVideoFocus,
} from "./session-ui.js?v=20260911-orientation-scroll-anchor-01";
import { handleRemoteState } from "./player/index.js?v=20261003-desktop-video-snap-center-01-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-15-video-snap-10px-fullscreen-bleed-01-seek-tooltip-stable-01-header-landscape-compact-01-component-stack-header-pc-gutter-01-component-stack-header-pc-gutter-02-component-stack-header-input-mode-01-component-stack-header-measured-gutter-01-component-stack-header-edge-geometry-02-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01";
import {
  beginSystemMessageHydration,
  finishSystemMessageHydration,
  renderMessage,
  renderReplyPreview,
  resetInsideUnread,
  resetPageUnread,
  setInsideChatVisible,
} from "./chat/index.js?v=20261003-name-editor-curtain-cancel-esc-blur-03-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-15-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01";
import {
  getRoomTabLimitConflictCount,
  writeActiveTabRecord,
} from "./room-access.js?v=20261004-room-join-race-01";
import {
  rememberLastRoom,
  sanitizeRoomInput,
  syncJoinRoomButtonState,
} from "./room-input.js?v=20261004-room-join-race-01";
import {
  beginRoomOperation,
  isRoomOperationCurrent,
  updateUrlRoom,
} from "./room-navigation.js?v=20261004-room-join-race-01";
import { setInviteCopyFeedback } from "./room-invite.js?v=20261004-room-join-race-01";
import { resetRoomPlayerState } from "./room-player-state.js?v=20261004-room-join-race-01";

async function closeTransport(transport) {
  try {
    await transport?.close?.();
  } catch {
    // Un transporte de una entrada cancelada ya no tiene estado que conservar.
  }
}

export async function joinRoom(rawRoomCode, sourceButton = "join") {
  const roomCode = sanitizeRoomInput(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }
  rememberLastRoom(roomCode);
  const userScrollIntentAtEntry = getUserScrollIntentVersion();

  const tabLimitConflictCount = getRoomTabLimitConflictCount();
  if (tabLimitConflictCount) {
    setSyncStatus("Límite de 1 sala activa alcanzado. Cerrá la otra pestaña o sala activa.");
    logEvent("room", "Bloqueado: ya hay " + tabLimitConflictCount + " pestaña(s) activas en esta sesión.");
    return;
  }
  const operationId = beginRoomOperation();

  setConnection("starting", "Conectando...");
  setSyncStatus("Ingresando a " + roomCode + "...");
  const loadingButton = sourceButton === "create" ? dom.createRoomButton : dom.joinRoomButton;
  const inactiveButton = sourceButton === "create" ? dom.joinRoomButton : dom.createRoomButton;
  if (loadingButton) {
    loadingButton.disabled = true;
    loadingButton.dataset.loading = "true";
    loadingButton.setAttribute("aria-busy", "true");
  }
  if (inactiveButton) {
    inactiveButton.disabled = true;
    delete inactiveButton.dataset.loading;
    inactiveButton.removeAttribute("aria-busy");
  }

  logEvent("room", "Entrando a sala " + roomCode + ".");

  let roomEntryVideoFocus = null;
  let nextTransport = null;
  let connectStarted = false;
  try {
    beginSystemMessageHydration();
    const previousTransport = state.session.transport;
    dom.messages.innerHTML = "";
    dom.overlayMessages.innerHTML = "";
    state.chat.lastMessageIds = new Set();
    resetPageUnread();
    state.chat.replyTarget = null;
    nextTransport = await createTransport(roomCode);
    if (!isRoomOperationCurrent(operationId)) return;

    state.session.knownParticipants = new Set([state.session.clientId]);
    state.session.knownMembers = new Map([[state.session.clientId, getDisplayName()]]);

    const whenCurrent = (handler) => (...args) => {
      if (isRoomOperationCurrent(operationId)) handler(...args);
    };
    const connectionHandlers = {
      onState: whenCurrent(handleRemoteState),
      onMessage: whenCurrent(renderMessage),
      onMembers: whenCurrent(renderMembers),
      onConnection: whenCurrent(setConnection),
      onStatus: whenCurrent(setSyncStatus),
    };

    dom.roomBadge.textContent = roomCode;
    showSession();
    syncComponentAspectLayoutNow();
    roomEntryVideoFocus = watchRoomEntryVideoFocus(userScrollIntentAtEntry);
    connectStarted = true;
    await nextTransport.connect(connectionHandlers);
    if (!isRoomOperationCurrent(operationId)) {
      roomEntryVideoFocus?.cancel();
      await closeTransport(nextTransport);
      return;
    }

    await Promise.resolve(previousTransport?.close?.()).catch(() => {});
    if (!isRoomOperationCurrent(operationId)) {
      roomEntryVideoFocus?.cancel();
      await closeTransport(nextTransport);
      return;
    }

    state.session.transport = nextTransport;
    writeActiveTabRecord(roomCode);
    state.session.activeRoom = roomCode;
    rememberLastRoom(roomCode);
    dom.roomInput.value = roomCode;
    syncJoinRoomButtonState();
    dom.roomBadge.textContent = roomCode;
    setInviteCopyFeedback(false);
    renderPresence();
    resetRoomPlayerState();
    updateUrlRoom(roomCode);

    showSession();
    syncComponentAspectLayoutNow();
    setHostBadge(state.session.hostRoomCode === roomCode);
    setInsideChatVisible(false, { source: "room-entry", skipScrollLock: true });
    resetInsideUnread();
    renderReplyPreview();
    roomEntryVideoFocus.activate();
    setSyncStatus("Sala activa.");
    logEvent("room", "Sala " + roomCode + " activa.");
  } catch (error) {
    if (!isRoomOperationCurrent(operationId)) {
      roomEntryVideoFocus?.cancel();
      if (connectStarted) await closeTransport(nextTransport);
      return;
    }
    roomEntryVideoFocus?.cancel();
    finishSystemMessageHydration();
    if (connectStarted) await closeTransport(nextTransport);
    if (!isRoomOperationCurrent(operationId)) return;
    showLobby();
    console.error(error);
    if (error?.code === "ROOM_FULL") {
      setSyncStatus("La sala " + roomCode + " ya alcanzó el máximo de " + MAX_ROOM_PARTICIPANTS + " participantes.");
      logEvent("room", "Ingreso bloqueado: " + roomCode + " completa.");
      return;
    }
    setConnection("error", "Sin conexion");
    setSyncStatus("No se pudo entrar a la sala.");
    logEvent("error", "No se pudo entrar a " + roomCode + ": " + (error.message || error));
  } finally {
    if (isRoomOperationCurrent(operationId)) {
      if (dom.joinRoomButton) {
        syncJoinRoomButtonState();
        delete dom.joinRoomButton.dataset.loading;
        dom.joinRoomButton.removeAttribute("aria-busy");
      }
      if (dom.createRoomButton) {
        dom.createRoomButton.disabled = false;
        delete dom.createRoomButton.dataset.loading;
        dom.createRoomButton.removeAttribute("aria-busy");
      }
    }
  }
}

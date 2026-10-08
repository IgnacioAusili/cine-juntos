import { dom } from "../core/dom.js";
import { state, getDisplayName, LAST_ROOM_KEY, logEvent } from "../core/state.js?v=20260914-console-log-controls-01";
import { renderPresence } from "./presence.js?v=20261003-name-editor-curtain-cancel-esc-blur-03";
import { setConnection } from "./icons-tooltips.js?v=20260914-tooltip-single-path-01-tooltip-focus-restore-skip-01";
import {
  setHostBadge,
  setSyncStatus,
  showLobby,
} from "./session-ui.js?v=20260911-orientation-scroll-anchor-01";
import {
  resetInsideUnread,
  resetPageUnread,
  renderReplyPreview,
  setInsideChatVisible,
  finishSystemMessageHydration,
} from "./chat/index.js?v=20261003-name-editor-curtain-cancel-esc-blur-03-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-16-bottom-chat-switch-measure-01-chat-header-anchor-04-chat-header-anchor-05-arrow-header-slot-center-01-aspect-dock-settle-01-collapsed-responsive-resize-01-collapse-arrow-tooltip-01-composer-width-01";
import { removeActiveTabRecord } from "./room-access.js?v=20261004-room-join-race-01";
import { invalidateRoomOperation, isRoomOperationCurrent, clearUrlRoom } from "./room-navigation.js?v=20261004-room-join-race-01";
import { syncJoinRoomButtonState } from "./room-input.js?v=20261004-room-join-race-01";
import { setInviteCopyFeedback } from "./room-invite.js?v=20261004-room-join-race-01";

export async function leaveRoom() {
  const operationId = invalidateRoomOperation();
  finishSystemMessageHydration();
  const activeTransport = state.session.transport;
  const activeRoom = state.session.activeRoom;

  state.session.transport = null;
  state.session.activeRoom = "";
  removeActiveTabRecord();

  try {
    await activeTransport?.close?.();
  } catch (error) {
    logEvent("error", "No se pudo cerrar la sala " + (activeRoom || "activa") + ": " + (error.message || error));
  }

  if (!isRoomOperationCurrent(operationId)) return;

  state.session.knownParticipants = new Set([state.session.clientId]);
  state.session.knownMembers = new Map([[state.session.clientId, getDisplayName()]]);
  state.chat.lastMessageIds = new Set();
  resetPageUnread();
  state.chat.replyTarget = null;
  state.player.lastRemoteState = null;
  state.player.remoteStateActive = false;
  window.clearInterval(state.player.playButtonCooldownTimeoutId);
  state.player.lastUserPauseAt = 0;
  state.player.playButtonPressTimes = [];
  state.player.playButtonCooldownUntil = 0;
  state.player.playButtonCooldownTimeoutId = null;

  dom.roomBadge.textContent = "Sin sala";
  setInviteCopyFeedback(false);
  dom.roomInput.value = localStorage.getItem(LAST_ROOM_KEY) || "";
  syncJoinRoomButtonState();
  if (dom.joinRoomButton) {
    delete dom.joinRoomButton.dataset.loading;
    dom.joinRoomButton.removeAttribute("aria-busy");
  }
  if (dom.createRoomButton) {
    dom.createRoomButton.disabled = false;
    delete dom.createRoomButton.dataset.loading;
    dom.createRoomButton.removeAttribute("aria-busy");
  }
  dom.messages.innerHTML = "";
  dom.overlayMessages.innerHTML = "";
  renderPresence();
  setHostBadge(false);
  setInsideChatVisible(false, { source: "leave-room", skipScrollLock: true });
  resetInsideUnread();
  renderReplyPreview();
  clearUrlRoom();
  setConnection("local", "Modo local");
  setSyncStatus("Listo");
  showLobby();
  logEvent("room", "Se volvió a la entrada desde " + (activeRoom || "la sala") + ".");
}

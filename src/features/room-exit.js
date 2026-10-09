import { dom } from "../core/dom.js";
import { state, getDisplayName, LAST_ROOM_KEY, logEvent } from "../core/state.js?v=20261008";
import { renderPresence } from "./presence.js?v=20261008";
import { setConnection } from "./icons-tooltips.js?v=20261008";
import {
  setHostBadge,
  setSyncStatus,
  showLobby,
} from "./session-ui.js?v=20261008";
import {
  resetInsideUnread,
  resetPageUnread,
  renderReplyPreview,
  setInsideChatVisible,
  finishSystemMessageHydration,
} from "./chat/index.js?v=20261009-emoji-reply-settle-01";
import { removeActiveTabRecord } from "./room-access.js?v=20261008";
import { invalidateRoomOperation, isRoomOperationCurrent, clearUrlRoom } from "./room-navigation.js?v=20261008";
import { syncJoinRoomButtonState } from "./room-input.js?v=20261008";
import { setInviteCopyFeedback } from "./room-invite.js?v=20261008";

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

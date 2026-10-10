import { dom } from "../core/dom.js";
import { updateDisplayName } from "./presence.js?v=20261008";
import { joinRoom } from "./room-entry.js?v=20261010-bottom-chat-collapse-rows-controls-01";
import { leaveRoom } from "./room-exit.js?v=20261010-bottom-chat-collapse-rows-controls-01";
import { copyInvite } from "./room-invite.js?v=20261009-invite-copy-animation-queue-01";
import {
  consumeRoomCreationAttempt,
  looksLikeRoomInviteUrl,
  rememberLastRoom,
  sanitizeRoomInput,
  syncJoinRoomButtonState,
} from "./room-input.js?v=20261008";
import { state, logEvent } from "../core/state.js?v=20261008";
import { generateRoomCode } from "../core/utils.js";
import { setSyncStatus } from "./session-ui.js?v=20261008";

const BACK_TO_LOBBY_ANIMATION_MS = 200;

export function wireRoomEvents() {
  let isLeavingRoom = false;
  syncJoinRoomButtonState();

  dom.roomInput.addEventListener("input", () => {
    const nextValue = sanitizeRoomInput(dom.roomInput.value);
    if (dom.roomInput.value !== nextValue) {
      const cursor = nextValue.length;
      dom.roomInput.value = nextValue;
      dom.roomInput.setSelectionRange(cursor, cursor);
    }
    rememberLastRoom(nextValue);
    syncJoinRoomButtonState();
  });

  dom.roomInput.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";
    if (!looksLikeRoomInviteUrl(pastedText)) return;

    event.preventDefault();
    const roomCode = sanitizeRoomInput(pastedText);
    dom.roomInput.value = roomCode;
    rememberLastRoom(roomCode);
    syncJoinRoomButtonState();
    void joinRoom(pastedText);
  });

  dom.createRoomButton.addEventListener("click", () => {
    if (!consumeRoomCreationAttempt()) {
      setSyncStatus("Alcanzaste el límite temporal de creación de salas. Intentá de nuevo en un minuto.");
      logEvent("room", "Creación bloqueada por límite temporal de intentos.");
      return;
    }
    const roomCode = sanitizeRoomInput(dom.roomInput.value) || generateRoomCode();
    dom.roomInput.value = roomCode;
    rememberLastRoom(roomCode);
    syncJoinRoomButtonState();
    state.session.hostRoomCode = roomCode;
    sessionStorage.setItem("cine-juntos-host-room", roomCode);
    void joinRoom(roomCode, "create");
  });

  dom.joinRoomButton.addEventListener("click", () => {
    void joinRoom(dom.roomInput.value, "join");
  });

  dom.copyInviteButton.addEventListener("click", copyInvite);
  dom.backToLobbyButton?.addEventListener("click", () => {
    if (isLeavingRoom) return;
    isLeavingRoom = true;
    dom.backToLobbyButton.classList.add("is-leaving");
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.setTimeout(() => {
      void leaveRoom();
    }, prefersReducedMotion ? 0 : BACK_TO_LOBBY_ANIMATION_MS);
  });

  dom.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void joinRoom(dom.roomInput.value);
  });

  dom.lobbyNameInput.addEventListener("input", () => {
    updateDisplayName(dom.lobbyNameInput.value, dom.lobbyNameInput, { allowLobbyEdit: true });
  });
}

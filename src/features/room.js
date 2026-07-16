// Entrada y salida de salas, reseteo de sesion y conexion con el transporte activo.
import {
  dom,
} from "../core/dom.js";
import {
  state,
  getDisplayName,
  logEvent,
} from "../core/state.js";
import {
  MAX_ROOM_PARTICIPANTS,
  generateRoomCode,
  normalizeRoomCode,
} from "../core/utils.js";
import { createTransport, createLocalTransport } from "../services/transport.js";
import {
  renderMembers,
  renderPresence,
  updateDisplayName,
} from "./presence.js";
import { setConnection } from "./ui.js";
import {
  focusMainWorkspace,
  setHostBadge,
  setSyncStatus,
  showSession,
} from "./session-ui.js";
import { handleRemoteState } from "./playerSync.js";
import {
  renderMessage,
  setInsideChatVisible,
  resetInsideUnread,
  resetExternalUnread,
  renderReplyPreview,
} from "./chat.js";

const openRooms = JSON.parse(sessionStorage.getItem("cine-juntos-open-rooms") || "[]");

export function wireRoomEvents() {
  dom.createRoomButton.addEventListener("click", () => {
    const roomCode = generateRoomCode();
    dom.roomInput.value = roomCode;
    state.session.hostRoomCode = roomCode;
    sessionStorage.setItem("cine-juntos-host-room", roomCode);
    joinRoom(roomCode);
  });

  dom.joinRoomButton.addEventListener("click", () => {
    joinRoom(dom.roomInput.value);
  });

  dom.copyInviteButton.addEventListener("click", copyInvite);

  dom.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      joinRoom(dom.roomInput.value);
    }
  });

  dom.lobbyNameInput.addEventListener("input", () => {
    updateDisplayName(dom.lobbyNameInput.value, dom.lobbyNameInput);
  });
}

export async function joinRoom(rawRoomCode) {
  const roomCode = normalizeRoomCode(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }

  const shouldTrackRoom = !openRooms.includes(roomCode);
  if (shouldTrackRoom && openRooms.length >= 2) {
    setSyncStatus("Límite de 2 salas alcanzado. Cierra otra pestaña.");
    logEvent("room", `Bloqueado: ya hay ${openRooms.length} salas abiertas en esta sesión.`);
    return;
  }

  logEvent("room", `Entrando a sala ${roomCode}.`);

  const previousTransport = state.session.transport;
  const nextTransport = await createTransport(roomCode);
  let activeTransport = null;
  const connectionHandlers = {
    onState: handleRemoteState,
    onMessage: renderMessage,
    onMembers: renderMembers,
    onConnection: setConnection,
    onStatus: setSyncStatus,
  };

  try {
    await nextTransport.connect(connectionHandlers);
    activeTransport = nextTransport;
  } catch (error) {
    console.error(error);
    if (error?.code === "ROOM_FULL") {
      setSyncStatus(`La sala ${roomCode} ya alcanzó el máximo de ${MAX_ROOM_PARTICIPANTS} participantes.`);
      logEvent("room", `Ingreso bloqueado: ${roomCode} completa.`);
      return;
    }
    if (nextTransport.mode === "firebase") {
      await nextTransport.close?.().catch(() => {});
      const fallbackTransport = createLocalTransport(roomCode, error);
      try {
        await fallbackTransport.connect(connectionHandlers);
        activeTransport = fallbackTransport;
      } catch (fallbackError) {
        console.error(fallbackError);
        if (fallbackError?.code === "ROOM_FULL") {
          setSyncStatus(`La sala ${roomCode} ya alcanzó el máximo de ${MAX_ROOM_PARTICIPANTS} participantes.`);
          logEvent("room", `Ingreso bloqueado: ${roomCode} completa.`);
          return;
        }
        setConnection("error", "Sin conexion");
        setSyncStatus("No se pudo entrar a la sala.");
        logEvent("error", `No se pudo entrar a ${roomCode}: ${fallbackError.message || fallbackError}`);
        return;
      }
    } else {
      setConnection("error", "Sin conexion");
      setSyncStatus("No se pudo entrar a la sala.");
      logEvent("error", `No se pudo entrar a ${roomCode}: ${error.message || error}`);
      return;
    }
  }

  await previousTransport?.close?.().catch(() => {});
  state.session.transport = activeTransport;
  if (shouldTrackRoom) {
    openRooms.push(roomCode);
    sessionStorage.setItem("cine-juntos-open-rooms", JSON.stringify(openRooms));
  }

  state.session.activeRoom = roomCode;
  dom.roomInput.value = roomCode;
  dom.roomBadge.textContent = roomCode;
  dom.messages.innerHTML = "";
  dom.overlayMessages.innerHTML = "";
  state.chat.lastMessageIds = new Set();
  state.session.knownParticipants = new Set([state.session.clientId]);
  state.session.knownMembers = new Map([[state.session.clientId, getDisplayName()]]);
  state.chat.replyTarget = null;
  renderPresence();
  state.player.lastRemoteState = null;
  updateUrlRoom(roomCode);

  showSession();
  setHostBadge(state.session.hostRoomCode === roomCode);
  setInsideChatVisible(false);
  resetInsideUnread();
  resetExternalUnread();
  renderReplyPreview();
  focusMainWorkspace();
  setSyncStatus("Sala activa.");
  logEvent("room", `Sala ${roomCode} activa.`);
}

export async function copyInvite() {
  if (!state.session.activeRoom) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }
  const invite = new URL(window.location.href);
  invite.searchParams.set("room", state.session.activeRoom);
  await navigator.clipboard.writeText(invite.toString()).catch(() => {});
  setSyncStatus("Invitacion copiada.");
}

function updateUrlRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url);
}

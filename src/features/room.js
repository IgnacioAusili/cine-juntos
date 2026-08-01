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
import { setConnection } from "./icons-tooltips.js";
import {
  focusMainWorkspace,
  setHostBadge,
  setSyncStatus,
  showLobby,
  showSession,
} from "./session-ui.js";
import { handleRemoteState } from "./player/index.js";
import {
  renderMessage,
  setInsideChatVisible,
  resetInsideUnread,
  resetExternalUnread,
  renderReplyPreview,
} from "./chat/index.js";

const ACTIVE_TAB_KEY = "cine-juntos-active-tab";
const ACTIVE_TAB_TTL_MS = 30000;
const MAX_OPEN_TABS = 1;
let inviteCopyFeedbackTimer = 0;

function getTabId() {
  const stored = sessionStorage.getItem("cine-juntos-tab-id");
  if (stored) return stored;
  const next = crypto.randomUUID();
  sessionStorage.setItem("cine-juntos-tab-id", next);
  return next;
}

function readActiveTabs() {
  const now = Date.now();
  const tabs = [];
  const seen = new Set();

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== ACTIVE_TAB_KEY && !key?.startsWith(`${ACTIVE_TAB_KEY}:`)) continue;

    try {
      const record = JSON.parse(localStorage.getItem(key));
      if (!record?.tabId || !record?.lastSeenAt) {
        localStorage.removeItem(key);
        continue;
      }
      if (now - record.lastSeenAt > ACTIVE_TAB_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      if (seen.has(record.tabId)) continue;
      seen.add(record.tabId);
      tabs.push(record);
    } catch {
      localStorage.removeItem(key);
    }
  }

  return tabs;
}

function getActiveTabRecordKey(tabId = getTabId()) {
  return `${ACTIVE_TAB_KEY}:${tabId}`;
}

function writeActiveTabRecord(roomCode) {
  const record = {
    tabId: getTabId(),
    roomCode,
    lastSeenAt: Date.now(),
  };
  localStorage.setItem(getActiveTabRecordKey(record.tabId), JSON.stringify(record));
  return record;
}

function removeActiveTabRecord() {
  localStorage.removeItem(getActiveTabRecordKey());
}

function looksLikeRoomInviteUrl(value) {
  const trimmed = String(value || "").trim();
  return Boolean(
    trimmed &&
      (trimmed.includes("://") ||
        trimmed.startsWith("www.") ||
        trimmed.startsWith("/") ||
        trimmed.startsWith("?") ||
        trimmed.includes("room="))
  );
}

function extractRoomCodeFromValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  if (looksLikeRoomInviteUrl(trimmed)) {
    try {
      const inviteUrl = new URL(trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed, window.location.href);
      const roomFromQuery = normalizeRoomCode(inviteUrl.searchParams.get("room")).slice(0, 5);
      if (roomFromQuery) return roomFromQuery;

      if (inviteUrl.hash) {
        const hashValue = inviteUrl.hash.startsWith("#") ? inviteUrl.hash.slice(1) : inviteUrl.hash;
        const hashParams = new URLSearchParams(hashValue);
        const roomFromHash = normalizeRoomCode(hashParams.get("room")).slice(0, 5);
        if (roomFromHash) return roomFromHash;
      }

      const pathMatch = inviteUrl.pathname.match(/\/([A-Z0-9]{4,12})\/?$/i);
      if (pathMatch) {
        const roomFromPath = normalizeRoomCode(pathMatch[1]).slice(0, 5);
        if (roomFromPath) return roomFromPath;
      }
    } catch {
      // Si no se puede interpretar como URL, cae al saneado normal de texto.
    }
  }

  return normalizeRoomCode(trimmed).slice(0, 5);
}

function sanitizeRoomInput(value) {
  return extractRoomCodeFromValue(value);
}

function syncJoinRoomButtonState() {
  if (!dom.joinRoomButton) return;
  dom.joinRoomButton.disabled = !sanitizeRoomInput(dom.roomInput.value);
}

function shouldEnforceSingleActiveTabLimit() {
  const hostname = window.location.hostname;
  if (window.location.protocol === "file:") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
    return false;
  }
  return true;
}

export function wireRoomEvents() {
  syncJoinRoomButtonState();

  dom.roomInput.addEventListener("input", () => {
    const nextValue = sanitizeRoomInput(dom.roomInput.value);
    if (dom.roomInput.value !== nextValue) {
      const cursor = nextValue.length;
      dom.roomInput.value = nextValue;
      dom.roomInput.setSelectionRange(cursor, cursor);
    }
    syncJoinRoomButtonState();
  });

  dom.roomInput.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";
    if (!looksLikeRoomInviteUrl(pastedText)) return;

    event.preventDefault();
    const roomCode = sanitizeRoomInput(pastedText);
    dom.roomInput.value = roomCode;
    syncJoinRoomButtonState();
    void joinRoom(pastedText);
  });

  dom.createRoomButton.addEventListener("click", () => {
    const roomCode = generateRoomCode();
    dom.roomInput.value = roomCode;
    syncJoinRoomButtonState();
    state.session.hostRoomCode = roomCode;
    sessionStorage.setItem("cine-juntos-host-room", roomCode);
    void joinRoom(roomCode);
  });

  dom.joinRoomButton.addEventListener("click", () => {
    void joinRoom(dom.roomInput.value);
  });

  dom.copyInviteButton.addEventListener("click", copyInvite);

  dom.backToLobbyButton?.addEventListener("click", () => {
    void leaveRoom();
  });

  dom.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void joinRoom(dom.roomInput.value);
    }
  });

  dom.lobbyNameInput.addEventListener("input", () => {
    updateDisplayName(dom.lobbyNameInput.value, dom.lobbyNameInput);
  });
}

export async function joinRoom(rawRoomCode) {
  const roomCode = sanitizeRoomInput(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }

  const activeTabs = readActiveTabs();
  const isCurrentTabAlreadyActive = activeTabs.some((record) => record.tabId === getTabId());
  const otherActiveTabs = activeTabs.filter((record) => record.tabId !== getTabId());
  if (
    shouldEnforceSingleActiveTabLimit() &&
    !isCurrentTabAlreadyActive &&
    otherActiveTabs.length >= MAX_OPEN_TABS
  ) {
    setSyncStatus("Límite de 1 sala activa alcanzado. Cerrá la otra pestaña o sala activa.");
    logEvent("room", `Bloqueado: ya hay ${otherActiveTabs.length} pestaña(s) activas en esta sesión.`);
    return;
  }

  setConnection("starting", "Conectando...");
  setSyncStatus(`Ingresando a ${roomCode}...`);
  if (dom.joinRoomButton) {
    dom.joinRoomButton.disabled = true;
    dom.joinRoomButton.dataset.loading = "true";
    dom.joinRoomButton.setAttribute("aria-busy", "true");
  }
  if (dom.createRoomButton) {
    dom.createRoomButton.disabled = true;
    dom.createRoomButton.dataset.loading = "true";
    dom.createRoomButton.setAttribute("aria-busy", "true");
  }

  logEvent("room", `Entrando a sala ${roomCode}.`);

  try {
    const previousTransport = state.session.transport;
    const nextTransport = await createTransport(roomCode);

    // Resetear el estado de sesión ANTES de conectar para que el
    // callback onMembers no sea pisado por el reseteo posterior.
    state.session.knownParticipants = new Set([state.session.clientId]);
    state.session.knownMembers = new Map([[state.session.clientId, getDisplayName()]]);

    const connectionHandlers = {
      onState: handleRemoteState,
      onMessage: renderMessage,
      onMembers: renderMembers,
      onConnection: setConnection,
      onStatus: setSyncStatus,
    };

    await nextTransport.connect(connectionHandlers);
    const activeTransport = nextTransport;

    await previousTransport?.close?.().catch(() => {});
    state.session.transport = activeTransport;
    writeActiveTabRecord(roomCode);

    state.session.activeRoom = roomCode;
    dom.roomInput.value = roomCode;
    syncJoinRoomButtonState();
    dom.roomBadge.textContent = roomCode;
    dom.messages.innerHTML = "";
    dom.overlayMessages.innerHTML = "";
    state.chat.lastMessageIds = new Set();
    state.chat.replyTarget = null;
    renderPresence();
    state.player.lastRemoteState = null;
    state.player.lastStateSentAt = 0;
    state.player.lastActionAt = 0;
    state.player.lastActionAuthor = "";
    state.player.lastPlaybackIssueAt = 0;
    state.player.lastPlaybackIssueReason = "";
    state.player.lastPlaybackIssueAnnouncementAt = 0;
    state.player.lastPlaybackIssueAnnouncementKey = "";
    state.player.remotePlaybackIssueCooldownUntil = 0;
    if (state.player.playbackRecoveryTimeoutId) {
      window.clearTimeout(state.player.playbackRecoveryTimeoutId);
    }
    if (state.player.playbackErrorTimeoutId) {
      window.clearTimeout(state.player.playbackErrorTimeoutId);
    }
    state.player.playbackRecoveryPending = false;
    state.player.playbackRecoveryAttempting = false;
    state.player.playbackRecoveryTimeoutId = null;
    state.player.playbackErrorTimeoutId = null;
    state.player.playbackErrorSnapshot = null;
    state.player.remoteStateActive = false;
    state.player.suppressVideoEvents = false;
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
  } catch (error) {
    console.error(error);
    if (error?.code === "ROOM_FULL") {
      setSyncStatus(`La sala ${roomCode} ya alcanzó el máximo de ${MAX_ROOM_PARTICIPANTS} participantes.`);
      logEvent("room", `Ingreso bloqueado: ${roomCode} completa.`);
      return;
    }
    setConnection("error", "Sin conexion");
    setSyncStatus("No se pudo entrar a la sala.");
    logEvent("error", `No se pudo entrar a ${roomCode}: ${error.message || error}`);
  } finally {
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

export async function copyInvite() {
  if (!state.session.activeRoom) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }
  const invite = new URL(window.location.href);
  invite.searchParams.set("room", state.session.activeRoom);
  try {
    await navigator.clipboard.writeText(invite.toString());
  } catch {
    return;
  }
  setInviteCopyFeedback(true);
  setSyncStatus("Invitacion copiada.");
}

export async function leaveRoom() {
  const activeTransport = state.session.transport;
  const activeRoom = state.session.activeRoom;

  state.session.transport = null;
  state.session.activeRoom = "";
  removeActiveTabRecord();

  try {
    await activeTransport?.close?.();
  } catch (error) {
    logEvent("error", `No se pudo cerrar la sala ${activeRoom || "activa"}: ${error.message || error}`);
  }

  state.session.knownParticipants = new Set([state.session.clientId]);
  state.session.knownMembers = new Map([[state.session.clientId, getDisplayName()]]);
  state.chat.lastMessageIds = new Set();
  state.chat.replyTarget = null;
  state.player.lastRemoteState = null;
  state.player.remoteStateActive = false;

  dom.roomBadge.textContent = "Sin sala";
  dom.roomInput.value = "";
  syncJoinRoomButtonState();
  dom.messages.innerHTML = "";
  dom.overlayMessages.innerHTML = "";
  renderPresence();
  setHostBadge(false);
  setInsideChatVisible(false);
  resetInsideUnread();
  resetExternalUnread();
  renderReplyPreview();
  clearUrlRoom();
  setConnection("local", "Modo local");
  setSyncStatus("Listo");
  showLobby();
  logEvent("room", `Se volvió a la entrada desde ${activeRoom || "la sala"}.`);
}

function setInviteCopyFeedback(active) {
  if (!dom.copyInviteButton) return;
  window.clearTimeout(inviteCopyFeedbackTimer);
  dom.copyInviteButton.dataset.copied = active ? "true" : "false";
  if (!active) return;
  inviteCopyFeedbackTimer = window.setTimeout(() => {
    if (dom.copyInviteButton) {
      dom.copyInviteButton.dataset.copied = "false";
    }
  }, 1600);
}

function updateUrlRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url);
}

function clearUrlRoom() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
}

window.addEventListener("beforeunload", removeActiveTabRecord);
window.addEventListener("pagehide", removeActiveTabRecord);

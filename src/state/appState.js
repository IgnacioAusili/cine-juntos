import { dom } from "../core/dom.js";
import { EXAMPLE_VIDEO_URL, getOrCreateClientId, makeGuestName } from "../core/utils.js";

export const firebaseConfig = window.CINE_JUNTOS_FIREBASE_CONFIG || {};

export const sessionState = {
  clientId: getOrCreateClientId(),
  activeRoom: "",
  transport: null,
  knownParticipants: null,
  knownMembers: null,
  hostRoomCode: sessionStorage.getItem("cine-juntos-host-room") || "",
  terminalLogsEnabled:
    Boolean(window.CINE_JUNTOS_TERMINAL_LOGS) ||
    new URLSearchParams(window.location.search).get("terminalLogs") === "1",
};

export const playerState = {
  lastRemoteState: null,
  suppressVideoEvents: false,
  lastStateSentAt: 0,
  lastActionAt: 0,
  lastActionAuthor: "",
  lastPlaybackIssueAt: 0,
  lastPlaybackIssueReason: "",
  remoteStateActive: false,
  syncStatusTimer: null,
};

export const chatState = {
  lastMessageIds: new Set(),
  unreadInsideCount: 0,
  unreadExternalCount: 0,
  replyTarget: null,
  pendingImage: "",
  pendingOverlayImage: "",
  menuMessage: null,
  messageMenuOpenedAt: 0,
  longPressTimer: null,
  longPressStart: null,
  mainScrollUnread: 0,
  overlayScrollUnread: 0,
};

export const uiState = {
  activeEmojiInput: null,
  tooltipTarget: null,
  tooltipPressTimer: null,
};

export const state = {
  session: sessionState,
  player: playerState,
  chat: chatState,
  ui: uiState,
};

state.session.knownParticipants = new Set([state.session.clientId]);
const initialDisplayName =
  localStorage.getItem("cine-juntos-name") || makeGuestName(state.session.clientId);
state.session.knownMembers = new Map([[state.session.clientId, initialDisplayName]]);

export function applyInitialDefaults() {
  dom.nameInput.value = initialDisplayName;
  dom.lobbyNameInput.value = initialDisplayName;
  dom.videoUrlInput.value = EXAMPLE_VIDEO_URL;
}

export function getDisplayName() {
  return dom.nameInput.value.trim().slice(0, 28) || makeGuestName(state.session.clientId);
}

export function getTransportNow() {
  return state.session.transport?.now?.() || Date.now();
}

export function makeMemberPayload() {
  return {
    id: state.session.clientId,
    name: getDisplayName(),
    lastSeenAt: getTransportNow(),
  };
}

export function logEvent(kind, message) {
  const now = new Date();
  const time = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.info(`[${time}] [${kind}] ${message}`);
  sendTerminalLog({
    at: now.toISOString(),
    room: state.session.activeRoom || null,
    client: state.session.clientId.slice(-6),
    kind,
    message,
  });
}

function sendTerminalLog(payload) {
  if (!state.session.terminalLogsEnabled) return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/__client-log", new Blob([body], { type: "application/json" }));
    return;
  }

  fetch("/__client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function detectTerminalLogEndpoint() {
  if (state.session.terminalLogsEnabled || window.location.protocol === "file:") return;

  fetch("/__client-log-ready", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) return;
      state.session.terminalLogsEnabled = true;
      logEvent("app", "Logs de terminal conectados.");
    })
    .catch(() => {});
}

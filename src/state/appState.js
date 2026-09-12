import { dom } from "../core/dom.js";
import {
  EXAMPLE_VIDEO_URL,
  makeGuestName,
  normalizeGuestName,
} from "../core/utils.js";
import { normalizeDisplayName } from "../core/name-policy.js?v=20260912-name-session-01";
import { getOrCreateClientId } from "../core/random-id.js?v=20260902-mobile-real-browser-02";

export const firebaseConfig = window.CINE_JUNTOS_FIREBASE_CONFIG || {};
const SESSION_NAME_KEY = "cine-juntos-name";
export const LAST_ROOM_KEY = "cine-juntos-last-room";
const CLIENT_LOG_LIMIT = 1000;
const clientLogBuffer = [];

// Versiones anteriores guardaban este contador en sessionStorage, que sobrevive
// una recarga. El cupo actual es solo de esta carga de la página.
sessionStorage.removeItem("cine-juntos-name-change-count");
sessionStorage.removeItem("cine-juntos-name-change-used");

function isLegacyAutomaticName(value) {
  return /^Usuario [A-Z0-9]{4}$/i.test(String(value || "").trim());
}

function readPersistedName() {
  const savedName = localStorage.getItem(SESSION_NAME_KEY);
  if (savedName && !isLegacyAutomaticName(savedName)) {
    const normalizedName = normalizeDisplayName(normalizeGuestName(savedName));
    if (normalizedName !== savedName) localStorage.setItem(SESSION_NAME_KEY, normalizedName);
    return normalizedName;
  }

  // Migrar el nombre que ya existía antes de hacerlo persistente entre sesiones.
  const legacyName = sessionStorage.getItem(SESSION_NAME_KEY);
  if (legacyName && !isLegacyAutomaticName(legacyName)) {
    const normalizedName = normalizeDisplayName(normalizeGuestName(legacyName));
    localStorage.setItem(SESSION_NAME_KEY, normalizedName);
    return normalizedName;
  }

  if (savedName && isLegacyAutomaticName(savedName)) {
    localStorage.removeItem(SESSION_NAME_KEY);
  }
  if (legacyName && isLegacyAutomaticName(legacyName)) {
    sessionStorage.removeItem(SESSION_NAME_KEY);
  }

  return "";
}

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
  lastKnownTime: 0,
  hasPlayableVideo: false,
  suppressVideoEvents: false,
  lastStateSentAt: 0,
  lastActionAt: 0,
  lastActionAuthor: "",
  lastPlaybackIssueAt: 0,
  lastPlaybackIssueReason: "",
  lastPlaybackIssueAnnouncementAt: 0,
  lastPlaybackIssueAnnouncementKey: "",
  playbackIssueDetectionTimerId: null,
  playbackIssueDetectionReason: "",
  remotePlaybackIssueCooldownUntil: 0,
  lastManualPauseAt: 0,
  lastUserPauseAt: 0,
  playButtonPressTimes: [],
  playButtonCooldownUntil: 0,
  playButtonCooldownTimeoutId: null,
  seekControlPressTimes: [],
  seekControlCooldownUntil: 0,
  seekControlCooldownTimeoutId: null,
  rateControlPressTimes: [],
  rateControlCooldownUntil: 0,
  rateControlCooldownTimeoutId: null,
  lastManualSeekAt: 0,
  remoteSeekPending: false,
  remoteSeekTimeoutId: null,
  lastResumePersistAt: 0,
  videoFingerprint: "",
  videoFingerprintSource: "",
  videoLoadCooldownUntil: 0,
  videoLoadCooldownTimeoutId: null,
  lastVideoLoadWasReload: false,
  playbackRecoveryPending: false,
  playbackRecoveryAttempting: false,
  playbackRecoveryTimeoutId: null,
  playbackErrorTimeoutId: null,
  playbackErrorSnapshot: null,
  remoteStateActive: false,
  slowLoadPromptTimeoutId: null,
  slowLoadPromptSource: "",
  resumePromptSource: "",
  syncStatusTimer: null,
  miniPlayerMode: "",
  scrollMiniPlayerDismissed: false,
};

export const chatState = {
  lastMessageIds: new Set(),
  unreadInsideCount: 0,
  pageUnreadCount: 0,
  pageTitleBase: document.title,
  autoExpandInsideEnabled: localStorage.getItem("cine-juntos-chat-auto-expand-inside") === "1",
  autoExpandExternalEnabled: localStorage.getItem("cine-juntos-chat-auto-expand-external") === "1",
  autoCollapseInsideTimer: null,
  autoCollapseExternalTimer: null,
  autoOpenedInside: false,
  autoOpenedExternal: false,
  replyTarget: null,
  replyPreviewScope: "both",
  pendingImage: [],
  pendingOverlayImage: [],
  menuMessage: null,
  menuReplyInput: null,
  messageMenuOpenedAt: 0,
  longPressTimer: null,
  longPressStart: null,
  systemGroupAnimationSuppressed: false,
  systemGroupAnimationMaxTimer: null,
  mainScrollUnread: 0,
  overlayScrollUnread: 0,
  // El cupo vive en memoria: una recarga inicia una nueva sesión de página.
  nameChangeCount: 0,
};

export const uiState = {
  activeEmojiInput: null,
  tooltipTarget: null,
  tooltipPressTimer: null,
  seekDragActive: false,
};

export const state = {
  session: sessionState,
  player: playerState,
  chat: chatState,
  ui: uiState,
};

state.session.knownParticipants = new Set([state.session.clientId]);
const persistedName = readPersistedName();
const initialDisplayName = persistedName || makeGuestName(state.session.clientId);
if (!persistedName) localStorage.setItem(SESSION_NAME_KEY, initialDisplayName);
state.session.knownMembers = new Map([[state.session.clientId, initialDisplayName]]);
state.session.knownMemberRecords = new Map([[
  state.session.clientId,
  {
    name: initialDisplayName,
    lastSeenAt: getTransportNow(),
  },
]]);

export function applyInitialDefaults() {
  const name = localStorage.getItem(SESSION_NAME_KEY) || initialDisplayName;
  if (dom.nameInput) dom.nameInput.value = name;
  if (dom.lobbyNameInput) dom.lobbyNameInput.value = name;
  if (dom.roomInput) dom.roomInput.value = localStorage.getItem(LAST_ROOM_KEY) || "";
  dom.videoUrlInput.value = EXAMPLE_VIDEO_URL;
}

export function getDisplayName() {
  const savedValue = localStorage.getItem(SESSION_NAME_KEY);
  const saved = normalizeDisplayName(savedValue);
  const inputVal = normalizeDisplayName(dom.lobbyNameInput?.value);
  if (saved !== savedValue) {
    localStorage.setItem(SESSION_NAME_KEY, saved || initialDisplayName);
  }
  if (inputVal) {
    if (saved !== inputVal) {
      localStorage.setItem(SESSION_NAME_KEY, inputVal);
    }
    return inputVal;
  }
  return saved || initialDisplayName;
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
  const line = `[${time}] [${kind}] ${message}`;
  clientLogBuffer.push(line);
  if (clientLogBuffer.length > CLIENT_LOG_LIMIT) clientLogBuffer.shift();
  console.info(line);
  sendTerminalLog({
    at: now.toISOString(),
    room: state.session.activeRoom || null,
    client: state.session.clientId.slice(-6),
    kind,
    message,
  });
}

export function getClientLogText() {
  return clientLogBuffer.join("\n");
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

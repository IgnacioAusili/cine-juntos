// Entrada y salida de salas, reseteo de sesion y conexion con el transporte activo.
import {
  dom,
} from "../core/dom.js";
import {
  state,
  getDisplayName,
  LAST_ROOM_KEY,
  logEvent,
} from "../core/state.js?v=20260914-console-log-controls-01";
import {
  MAX_ROOM_PARTICIPANTS,
  ROOM_CREATE_ATTEMPT_LIMIT,
  ROOM_CREATE_ATTEMPT_WINDOW_MS,
  generateRoomCode,
  normalizeRoomCode,
} from "../core/utils.js";
import { createRandomId } from "../core/random-id.js?v=20260902-mobile-real-browser-02";
import { createTransport, createLocalTransport } from "../services/transport.js?v=20260912-name-session-01";
import {
  renderMembers,
  renderPresence,
  updateDisplayName,
} from "./presence.js?v=20260912-name-session-01";
import { setConnection } from "./icons-tooltips.js?v=20260914-tooltip-single-path-01";
import {
  getUserScrollIntentVersion,
  setHostBadge,
  setSyncStatus,
  showLobby,
  showSession,
  watchRoomEntryVideoFocus,
} from "./session-ui.js?v=20260911-orientation-scroll-anchor-01";
import { handleRemoteState } from "./player/index.js?v=20260915-desktop-emoji-focus-01";
import {
  renderMessage,
  beginSystemMessageHydration,
  finishSystemMessageHydration,
  setInsideChatVisible,
  resetInsideUnread,
  resetPageUnread,
  renderReplyPreview,
} from "./chat/index.js?v=20260915-desktop-emoji-focus-02";

const ACTIVE_TAB_KEY = "cine-juntos-active-tab";
const ACTIVE_TAB_TTL_MS = 30000;
const MAX_OPEN_TABS = 1;
const ROOM_CREATE_ATTEMPTS_KEY = "cine-juntos-room-create-attempts";
let inviteCopyFeedbackTimer = 0;
let inviteCopyAnimationTimer = 0;

function getTabId() {
  const stored = sessionStorage.getItem("cine-juntos-tab-id");
  if (stored) return stored;
  const next = createRandomId();
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

function rememberLastRoom(roomCode) {
  const normalizedRoom = sanitizeRoomInput(roomCode);
  if (normalizedRoom) {
    localStorage.setItem(LAST_ROOM_KEY, normalizedRoom);
  }
}

function syncJoinRoomButtonState() {
  if (!dom.joinRoomButton) return;
  dom.joinRoomButton.disabled = !sanitizeRoomInput(dom.roomInput.value);
}

function consumeRoomCreationAttempt() {
  const now = Date.now();
  let attempts = [];
  try {
    attempts = JSON.parse(localStorage.getItem(ROOM_CREATE_ATTEMPTS_KEY) || "[]");
  } catch {
    attempts = [];
  }
  attempts = Array.isArray(attempts)
    ? attempts.filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < ROOM_CREATE_ATTEMPT_WINDOW_MS)
    : [];
  if (attempts.length >= ROOM_CREATE_ATTEMPT_LIMIT) return false;
  attempts.push(now);
  localStorage.setItem(ROOM_CREATE_ATTEMPTS_KEY, JSON.stringify(attempts));
  return true;
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
    void leaveRoom();
  });

  dom.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      void joinRoom(dom.roomInput.value);
    }
  });

  dom.lobbyNameInput.addEventListener("input", () => {
    updateDisplayName(dom.lobbyNameInput.value, dom.lobbyNameInput, { allowLobbyEdit: true });
  });
}

const COPY_ANIMATION_DEBUG_TAG = "[cine-copy-animation-debug]";
const COPY_CURSOR_DEBUG_TAG = "[cine-cursor-debug]";

function isConsoleDiagnosticsRoute() {
  return window.location.pathname === "/console"
    || new URLSearchParams(window.location.search).has("console");
}

export function wireCopyAnimationDiagnostics() {
  const button = dom.copyInviteButton;
  if (!button || !isConsoleDiagnosticsRoute() || button.__copyAnimationDiagnosticsWired) return;
  button.__copyAnimationDiagnosticsWired = true;

  const main = button.querySelector(".room-chip-copy-main");
  const confirmation = button.querySelector(".room-chip-copy-confirm");
  const titleActions = button.closest(".room-chip-title-actions");
  const title = button.closest(".room-chip-title");
  const roomChip = button.closest(".room-chip");
  const startedAt = performance.now();
  let baseline = null;
  let sampling = false;
  let animationFrame = 0;
  let lastSampleAt = -Infinity;
  let samplingStartedAt = 0;

  const round = (value) => Math.round(Number(value || 0) * 100) / 100;

  const describeRect = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: round(rect.left),
      right: round(rect.right),
      top: round(rect.top),
      bottom: round(rect.bottom),
      width: round(rect.width),
      height: round(rect.height),
    };
  };

  const describeStyle = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationPlayState: style.animationPlayState,
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      transitionTimingFunction: style.transitionTimingFunction,
      width: style.width,
      display: style.display,
    };
  };

  const getGeometry = () => ({
    button: describeRect(button),
    main: describeRect(main),
    confirmation: describeRect(confirmation),
    titleActions: describeRect(titleActions),
    title: describeRect(title),
    roomChip: describeRect(roomChip),
  });

  const getDeltas = (geometry) => {
    if (!baseline || !geometry) return null;
    return Object.fromEntries(
      Object.entries(geometry).map(([name, rect]) => [
        name,
        rect && baseline[name]
          ? {
              left: round(rect.left - baseline[name].left),
              right: round(rect.right - baseline[name].right),
              width: round(rect.width - baseline[name].width),
            }
          : null,
      ]),
    );
  };

  const getAnimations = () => button.getAnimations({ subtree: true }).map((animation) => ({
    target: animation.effect?.target?.className || animation.effect?.target?.id || null,
    animationName: animation.animationName || null,
    currentTime: animation.currentTime == null ? null : round(animation.currentTime),
    playState: animation.playState,
  }));

  const snapshot = (eventName, extra = {}) => {
    const geometry = getGeometry();
    return {
      tag: COPY_ANIMATION_DEBUG_TAG,
      elapsedMs: Math.round(performance.now() - startedAt),
      event: eventName,
      dataCopied: button.dataset.copied || null,
      className: button.className,
      geometry,
      deltasFromClick: getDeltas(geometry),
      styles: {
        button: describeStyle(button),
        main: describeStyle(main),
        confirmation: describeStyle(confirmation),
      },
      animations: getAnimations(),
      ...extra,
    };
  };

  const emit = (eventName, extra = {}) => {
    const payload = snapshot(eventName, extra);
    logEvent("copy-animation-debug", JSON.stringify(payload));
  };

  const getPointerTarget = (event) => {
    const target = event?.target instanceof Element ? event.target : null;
    const pointTarget = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;
    const describeTarget = (element) => element
      ? {
          tag: element.tagName,
          id: element.id || null,
          className: typeof element.className === "string" ? element.className : null,
          cursor: getComputedStyle(element).cursor,
        }
      : null;
    return {
      pointerType: event?.pointerType || null,
      clientX: round(event?.clientX),
      clientY: round(event?.clientY),
      target: describeTarget(target),
      relatedTarget: describeTarget(event?.relatedTarget instanceof Element ? event.relatedTarget : null),
      elementFromPoint: describeTarget(pointTarget),
      buttonHovered: button.matches(":hover"),
      mainHovered: Boolean(main?.matches(":hover")),
      buttonCursor: getComputedStyle(button).cursor,
      mainCursor: main ? getComputedStyle(main).cursor : null,
    };
  };

  const emitCursor = (eventName, event) => {
    const payload = snapshot(eventName, {
      cursor: getPointerTarget(event),
    });
    logEvent("cursor-debug", JSON.stringify({ ...payload, tag: COPY_CURSOR_DEBUG_TAG }));
  };

  const sample = (timestamp) => {
    const elapsed = timestamp - samplingStartedAt;
    if (timestamp - lastSampleAt >= 50 || elapsed >= 1400) {
      lastSampleAt = timestamp;
      emit("sample");
    }
    if (sampling && elapsed < 1450) {
      animationFrame = window.requestAnimationFrame(sample);
    } else {
      sampling = false;
      animationFrame = 0;
      emit("sample-end");
    }
  };

  const startSampling = () => {
    if (sampling) return;
    sampling = true;
    samplingStartedAt = performance.now();
    lastSampleAt = -Infinity;
    animationFrame = window.requestAnimationFrame(sample);
  };

  button.addEventListener("click", () => {
    baseline = getGeometry();
    emit("click-baseline");
  });

  button.addEventListener("pointerover", (event) => emitCursor("pointerover", event));
  button.addEventListener("pointerout", (event) => emitCursor("pointerout", event));
  button.addEventListener("pointerenter", (event) => emitCursor("pointerenter", event));
  button.addEventListener("pointerleave", (event) => emitCursor("pointerleave", event));

  let lastPointerMoveAt = -Infinity;
  window.addEventListener("pointermove", (event) => {
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const isNearButton = event.clientX >= rect.left - margin
      && event.clientX <= rect.right + margin
      && event.clientY >= rect.top - margin
      && event.clientY <= rect.bottom + margin;
    if (!isNearButton || event.timeStamp - lastPointerMoveAt < 40) return;
    lastPointerMoveAt = event.timeStamp;
    emitCursor("pointermove", event);
  }, true);

  button.addEventListener("animationstart", (event) => {
    emit("animationstart", { animationName: event.animationName });
    startSampling();
  });
  button.addEventListener("animationend", (event) => {
    emit("animationend", { animationName: event.animationName });
  });
  main?.addEventListener("animationstart", (event) => {
    emit("main-animationstart", { animationName: event.animationName });
    startSampling();
  });
  main?.addEventListener("animationend", (event) => {
    emit("main-animationend", { animationName: event.animationName });
  });
  confirmation?.addEventListener("transitionrun", (event) => {
    emit("confirmation-transitionrun", { propertyName: event.propertyName });
    startSampling();
  });
  confirmation?.addEventListener("transitionstart", (event) => {
    emit("confirmation-transitionstart", { propertyName: event.propertyName });
  });
  confirmation?.addEventListener("transitionend", (event) => {
    emit("confirmation-transitionend", { propertyName: event.propertyName });
  });

  const observer = new MutationObserver((records) => {
    const changes = records.map((record) => ({
      attributeName: record.attributeName,
      value: record.target.getAttribute(record.attributeName),
    }));
    emit("mutation", { changes });
    if (button.classList.contains("is-copy-animating") || button.dataset.copied === "true") {
      startSampling();
    }
  });
  observer.observe(button, {
    attributes: true,
    attributeFilter: ["class", "data-copied"],
  });

  emit("enabled");
}

export async function joinRoom(rawRoomCode, sourceButton = "join") {
  const roomCode = sanitizeRoomInput(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }
  rememberLastRoom(roomCode);
  const userScrollIntentAtEntry = getUserScrollIntentVersion();

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

  logEvent("room", `Entrando a sala ${roomCode}.`);

  let roomEntryVideoFocus = null;
  try {
    beginSystemMessageHydration();
    const previousTransport = state.session.transport;
    dom.messages.innerHTML = "";
    dom.overlayMessages.innerHTML = "";
    state.chat.lastMessageIds = new Set();
    resetPageUnread();
    state.chat.replyTarget = null;
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

    // Mostrar la sala mientras termina la sincronización de presencia. El
    // historial ya tiene sus listeners registrados y no debe quedar oculto
    // detrás de la transacción de members.
    dom.roomBadge.textContent = roomCode;
    showSession();
    roomEntryVideoFocus = watchRoomEntryVideoFocus(userScrollIntentAtEntry);
    await nextTransport.connect(connectionHandlers);
    const activeTransport = nextTransport;

    await Promise.resolve(previousTransport?.close?.()).catch(() => {});
    state.session.transport = activeTransport;
    writeActiveTabRecord(roomCode);

    state.session.activeRoom = roomCode;
    rememberLastRoom(roomCode);
    dom.roomInput.value = roomCode;
    syncJoinRoomButtonState();
    dom.roomBadge.textContent = roomCode;
    setInviteCopyFeedback(false);
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
    window.clearInterval(state.player.playButtonCooldownTimeoutId);
    state.player.lastUserPauseAt = 0;
    state.player.playButtonPressTimes = [];
    state.player.playButtonCooldownUntil = 0;
    state.player.playButtonCooldownTimeoutId = null;
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
    setInsideChatVisible(false, { source: "room-entry", skipScrollLock: true });
    resetInsideUnread();
    renderReplyPreview();
    roomEntryVideoFocus.activate();
    setSyncStatus("Sala activa.");
    logEvent("room", `Sala ${roomCode} activa.`);
  } catch (error) {
    roomEntryVideoFocus?.cancel();
    finishSystemMessageHydration();
    showLobby();
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
  if (!await copyTextToClipboard(invite.toString())) {
    return;
  }
  setInviteCopyFeedback(true);
  setSyncStatus("Invitacion copiada.");
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Chrome Android puede rechazar Clipboard API en una página no segura o
    // después de una transición de foco; continuar con el método compatible.
  }

  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.setAttribute("aria-hidden", "true");
  Object.assign(fallbackInput.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(fallbackInput);
  fallbackInput.focus({ preventScroll: true });
  fallbackInput.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  fallbackInput.remove();
  return copied;
}

export async function leaveRoom() {
  finishSystemMessageHydration();
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
  logEvent("room", `Se volvió a la entrada desde ${activeRoom || "la sala"}.`);
}

function setInviteCopyFeedback(active) {
  if (!dom.copyInviteButton) return;
  window.clearTimeout(inviteCopyFeedbackTimer);
  window.clearTimeout(inviteCopyAnimationTimer);
  dom.copyInviteButton.dataset.copied = active ? "true" : "false";
  dom.copyInviteButton.classList.remove("is-copy-animating");
  if (!active) return;

  // Reinicia la animación incluso si se copia otra vez antes de que termine
  // el feedback anterior.
  void dom.copyInviteButton.offsetWidth;
  dom.copyInviteButton.classList.add("is-copy-animating");
  inviteCopyAnimationTimer = window.setTimeout(() => {
    dom.copyInviteButton?.classList.remove("is-copy-animating");
  }, 800);
  inviteCopyFeedbackTimer = window.setTimeout(() => {
    if (dom.copyInviteButton) {
      dom.copyInviteButton.dataset.copied = "false";
    }
  }, 950);
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

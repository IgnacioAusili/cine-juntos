// Sincronizacion del player con la sala: estado remoto, aplicacion y publicacion.
import { dom } from "../../core/dom.js";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js";
import {
  MAX_DRIFT_SECONDS,
  HARD_DRIFT_SECONDS,
  SEND_THROTTLE_MS,
  formatSeconds,
} from "../../core/utils.js";
import { markParticipantActive, rememberParticipant } from "../presence.js";
import { setSyncStatus } from "../session-ui.js";
import { sendVideoEventMessage, renderMessage } from "../chat/index.js";
// Import circular intencional y seguro: estas funciones se invocan en runtime,
// no durante la carga del modulo, y player.js a su vez importa publishState.
import { setVideoSource, waitForVideoMetadata } from "./player.js";

const PLAYBACK_ISSUE_SYNC_COOLDOWN_MS = 2200;
const PAUSE_TO_ISSUE_GRACE_MS = 900;
const SEEK_TO_ISSUE_GRACE_MS = 1400;
const REMOTE_HOLD_ISSUE_SUPPRESSION_MS = 2200;
const PLAYBACK_RECOVERY_TIMEOUT_MS = 5 * 60 * 1000;

export function handleRemoteState(statePayload) {
  if (!statePayload || statePayload.from === state.session.clientId) return;
  rememberParticipant(statePayload.from, statePayload.name);
  markParticipantActive(statePayload.from, statePayload.name);
  state.player.lastRemoteState = statePayload;
  logEvent(
    "sync:recv",
    `${statePayload.action || "evento"} de ${statePayload.name || "otro usuario"} en ${formatSeconds(statePayload.time)} (paused=${String(Boolean(statePayload.paused))}, sentAt=${String(statePayload.sentAt || 0)}).`,
  );

  state.player.lastActionAt = Date.now();
  state.player.lastActionAuthor = statePayload.from;

  applyRemoteState(statePayload, statePayload.action === "hold");
}

async function applyRemoteState(statePayload, force = false) {
  if (!statePayload.src && !dom.videoPlayer.currentSrc) return;

  state.player.suppressVideoEvents = true;
  state.player.remoteStateActive = true;
  if (statePayload.action === "hold") {
    state.player.remotePlaybackIssueCooldownUntil = Date.now() + REMOTE_HOLD_ISSUE_SUPPRESSION_MS;
  }
  try {
    if (statePayload.src && statePayload.src !== dom.videoPlayer.currentSrc && statePayload.src !== dom.videoPlayer.src) {
      setVideoSource(statePayload.src, false);
      await waitForVideoMetadata().catch(() => {});
    }

    const targetTime = getRemoteTargetTime(statePayload);
    const currentTime = Number(dom.videoPlayer.currentTime) || 0;
    const drift = Number.isFinite(targetTime) ? Math.abs(currentTime - targetTime) : 0;
    const shouldSeek = force ? drift > MAX_DRIFT_SECONDS : drift > HARD_DRIFT_SECONDS;
    logEvent(
      "debug",
      `Aplicar remoto: action=${statePayload.action || "evento"} base=${formatSeconds(statePayload.time)} target=${formatSeconds(targetTime)} current=${formatSeconds(currentTime)} drift=${drift.toFixed(2)} paused=${String(Boolean(statePayload.paused))}.`,
    );
    if (Number.isFinite(targetTime) && shouldSeek) {
      dom.videoPlayer.currentTime = Math.max(0, targetTime);
    }

    if (Number.isFinite(statePayload.rate) && dom.videoPlayer.playbackRate !== statePayload.rate) {
      dom.videoPlayer.playbackRate = statePayload.rate;
    }

    if (statePayload.paused) {
      dom.videoPlayer.pause();
    } else {
      try {
        await dom.videoPlayer.play();
      } catch (playError) {
        console.warn("La reproducción automática fue bloqueada o interrumpida:", playError);
        setSyncStatus("Play recibido. Haz click para reproducir.");
      }
    }

    state.player.lastKnownTime = Math.max(
      0,
      Number.isFinite(targetTime) ? Number(targetTime) : Number(dom.videoPlayer.currentTime) || 0,
    );
    setSyncStatus(getRemoteStatusText(statePayload));
    logEvent("sync:apply", `Aplicado ${statePayload.action || "evento"} a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
  } catch (error) {
    console.error("Error aplicando el estado remoto:", error);
  } finally {
    window.setTimeout(() => {
      state.player.suppressVideoEvents = false;
      state.player.remoteStateActive = false;
    }, 550);
  }
}

function getRemoteTargetTime(statePayload) {
  const baseTime = Number(statePayload.time);
  if (!Number.isFinite(baseTime)) return 0;
  if (statePayload.paused) return baseTime;

  const sentAt = Number(statePayload.sentAt);
  const rate = Number.isFinite(Number(statePayload.rate)) ? Number(statePayload.rate) : 1;
  const elapsed = Number.isFinite(sentAt) ? Math.max(0, (getTransportNow() - sentAt) / 1000) : 0;
  return baseTime + elapsed * rate;
}

function getRemoteStatusText(statePayload) {
  if (statePayload.action === "hold") {
    return `${statePayload.name || "Alguien"} detuvo la sala por ${describePlaybackIssue(statePayload.issueReason)}.`;
  }
  return `Sincronizado con ${statePayload.name || "la sala"}.`;
}

function describePlaybackIssue(reason) {
  if (reason === "waiting") return "espera de carga";
  if (reason === "stalled") return "video trabado";
  if (reason === "error") return "error de reproducción";
  return "un problema de reproducción";
}

export function pauseRoomForPlaybackIssue(reason) {
  if (state.player.remoteStateActive || state.player.suppressVideoEvents) return;
  if (!dom.videoPlayer.currentSrc && !dom.videoPlayer.src && !dom.videoUrlInput.value.trim()) return;
  if (dom.videoPlayer.ended) return;
  if (reason !== "error" && dom.videoPlayer.paused) return;
  if (
    (reason === "waiting" || reason === "stalled") &&
    Date.now() < Number(state.player.remotePlaybackIssueCooldownUntil || 0)
  ) {
    logEvent(
      "sync:issue",
      `Incidencia local ignorada por una pausa remota reciente (${reason}).`,
    );
    return;
  }
  if (reason === "waiting" || reason === "stalled") {
    const lastPauseAt = Number(state.player.lastManualPauseAt || 0);
    if (lastPauseAt && Date.now() - lastPauseAt < PAUSE_TO_ISSUE_GRACE_MS) return;
    const lastSeekAt = Number(state.player.lastManualSeekAt || 0);
    if (lastSeekAt && Date.now() - lastSeekAt < SEEK_TO_ISSUE_GRACE_MS) return;
    if (dom.videoPlayer.paused || dom.videoPlayer.ended || dom.videoPlayer.seeking) return;
    if (dom.videoPlayer.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
  }

  const localNow = Date.now();
  if (
    state.player.lastPlaybackIssueReason === reason &&
    (localNow - state.player.lastPlaybackIssueAt < PLAYBACK_ISSUE_SYNC_COOLDOWN_MS)
  ) {
    return;
  }

  state.player.lastPlaybackIssueAt = localNow;
  state.player.lastPlaybackIssueReason = reason;
  logEvent("sync:issue", `Incidencia local: ${describePlaybackIssue(reason)} en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
  const issueTime = getPlaybackSnapshotTime();
  const shouldAnnounceIssue = shouldAnnouncePlaybackIssue(reason);

  // Mostrar aviso en el chat local siempre, independientemente de si hay sala activa.
  if (shouldAnnounceIssue) {
    const displayName = getDisplayName();
    const issueText = `${displayName} ${describePlaybackIssueChat(reason)} en ${formatSeconds(issueTime)}`;
    renderMessage({
      id: `issue-${localNow}-${reason}`,
      from: state.session.clientId,
      name: displayName,
      text: issueText,
      system: true,
      createdAt: localNow,
    });
  }

  if (!state.session.activeRoom || !state.session.transport) return;
  beginPlaybackRecoveryWindow(reason);

  const previousSuppress = state.player.suppressVideoEvents;
  state.player.suppressVideoEvents = true;
  try {
    dom.videoPlayer.pause();
  } finally {
    window.setTimeout(() => {
      if (!state.player.remoteStateActive) {
        state.player.suppressVideoEvents = previousSuppress;
      }
    }, 280);
  }

  setSyncStatus(`Pausa sincronizada por ${describePlaybackIssue(reason)}.`);
  publishState("hold", {
    paused: true,
    issueReason: reason,
    time: issueTime,
    suppressActivityMessage: !shouldAnnounceIssue,
  });
}

function describePlaybackIssueChat(reason) {
  return "tiene inconvenientes en el video";
}

export function clearPlaybackRecoveryTracking() {
  if (state.player.playbackRecoveryTimeoutId) {
    window.clearTimeout(state.player.playbackRecoveryTimeoutId);
  }
  state.player.playbackRecoveryPending = false;
  state.player.playbackRecoveryAttempting = false;
  state.player.playbackRecoveryTimeoutId = null;
  clearPlaybackIssueAnnouncementTracking();
}

export function attemptPlaybackRecovery(trigger) {
  if (!state.player.playbackRecoveryPending || state.player.playbackRecoveryAttempting) return;
  if (!state.session.activeRoom || !state.session.transport) {
    clearPlaybackRecoveryTracking();
    return;
  }
  if (state.player.remoteStateActive) return;
  if (dom.videoPlayer.error) return;
  if (
    trigger !== "playing" &&
    dom.videoPlayer.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
  ) {
    return;
  }
  if (state.player.suppressVideoEvents) {
    window.setTimeout(() => {
      attemptPlaybackRecovery(trigger);
    }, 320);
    return;
  }

  state.player.playbackRecoveryAttempting = true;
  logEvent(
    "sync:issue",
    `Se detectó recuperación local (${trigger}); intentando reanudar la sala.`,
  );

  dom.videoPlayer
    .play()
    .then(() => {
      clearPlaybackRecoveryTracking();
      setSyncStatus("Reanudación automática en curso.");
    })
    .catch((error) => {
      state.player.playbackRecoveryAttempting = false;
      logEvent(
        "sync:issue",
        `No se pudo reanudar automáticamente tras la recuperación: ${error.message || error}.`,
      );
      setSyncStatus("El video volvió, pero no se pudo reanudar automáticamente.");
    });
}

function beginPlaybackRecoveryWindow(reason) {
  clearPlaybackRecoveryTracking();
  state.player.playbackRecoveryPending = true;
  state.player.lastPlaybackIssueReason = reason;
  state.player.playbackRecoveryTimeoutId = window.setTimeout(() => {
    if (!state.player.playbackRecoveryPending) return;
    clearPlaybackRecoveryTracking();
    logEvent(
      "sync:issue",
      `La espera de recuperación automática expiró tras ${Math.round(PLAYBACK_RECOVERY_TIMEOUT_MS / 60000)} minutos.`,
    );
    setSyncStatus("La reanudación automática expiró.");
  }, PLAYBACK_RECOVERY_TIMEOUT_MS);
}

export function publishState(action, overrides = {}) {
  if (!state.session.activeRoom || !state.session.transport) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }

  if (state.player.remoteStateActive) return;

  const { suppressActivityMessage = false, ...transportOverrides } = overrides;

  const localNow = Date.now();

  if (
    action !== "hold" &&
    state.player.lastActionAuthor &&
    state.player.lastActionAuthor !== state.session.clientId &&
    (localNow - state.player.lastActionAt < 2000)
  ) {
    logEvent("antilag", `Acción '${action}' bloqueada temporalmente (cooldown de otro usuario activo).`);
    setSyncStatus("Espera 2s para interactuar (cooldown).");
    logEvent(
      "debug",
      `Anti-lag activo para action=${action} lastAuthor=${state.player.lastActionAuthor.slice(-6)} delta=${localNow - state.player.lastActionAt}ms lastRemote=${state.player.lastRemoteState ? formatSeconds(state.player.lastRemoteState.time) : "none"}.`,
    );

    if (action === "seek") {
      return;
    }

    if (state.player.lastRemoteState && !state.player.suppressVideoEvents) {
      state.player.suppressVideoEvents = true;
      try {
        if (state.player.lastRemoteState.paused) {
          dom.videoPlayer.pause();
        } else {
          dom.videoPlayer.play().catch(() => {});
        }
        dom.videoPlayer.currentTime = getRemoteTargetTime(state.player.lastRemoteState);
      } finally {
        window.setTimeout(() => {
          state.player.suppressVideoEvents = false;
        }, 300);
      }
    }
    return;
  }

  if (
    localNow - state.player.lastStateSentAt < SEND_THROTTLE_MS &&
    action !== "video" &&
    action !== "sync" &&
    action !== "hold"
  ) return;

  state.player.lastActionAt = localNow;
  state.player.lastActionAuthor = state.session.clientId;
  state.player.lastStateSentAt = localNow;
  markParticipantActive(state.session.clientId, getDisplayName());

  const syncNow = getTransportNow();
  const payloadTime = Number.isFinite(Number(overrides.time))
    ? Math.max(0, Number(overrides.time))
    : getPlaybackSnapshotTime();
  logEvent(
    "debug",
    `Publicar ${action}: payloadTime=${formatSeconds(payloadTime)} current=${formatSeconds(dom.videoPlayer.currentTime)} lastKnown=${formatSeconds(state.player.lastKnownTime)} paused=${String(dom.videoPlayer.paused)} overrides=${JSON.stringify(transportOverrides)}.`,
  );
  const payload = {
    action,
    from: state.session.clientId,
    name: getDisplayName(),
    src: dom.videoPlayer.currentSrc || dom.videoPlayer.src || dom.videoUrlInput.value.trim(),
    time: payloadTime,
    paused: dom.videoPlayer.paused,
    rate: Number(dom.videoPlayer.playbackRate || 1),
    sentAt: syncNow,
    ...transportOverrides,
  };

  state.session.transport.sendState(payload).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar sincronizacion: ${error.message || error}`);
    setSyncStatus("No se pudo enviar la sincronizacion.");
  });
  if (!suppressActivityMessage) {
    sendVideoEventMessage(action, payload);
  }
  logEvent("sync:send", `${action} en ${formatSeconds(payload.time)} (${payload.paused ? "pausado" : "play"}).`);
}

function shouldAnnouncePlaybackIssue(reason) {
  const localNow = Date.now();
  const announcementKey = getPlaybackIssueAnnouncementKey(reason);

  if (
    state.player.playbackRecoveryPending &&
    state.player.lastPlaybackIssueAnnouncementKey === announcementKey
  ) {
    return false;
  }

  if (
    state.player.lastPlaybackIssueAnnouncementKey === announcementKey &&
    (localNow - state.player.lastPlaybackIssueAnnouncementAt < PLAYBACK_ISSUE_SYNC_COOLDOWN_MS)
  ) {
    return false;
  }

  state.player.lastPlaybackIssueAnnouncementKey = announcementKey;
  state.player.lastPlaybackIssueAnnouncementAt = localNow;
  return true;
}

function clearPlaybackIssueAnnouncementTracking() {
  state.player.lastPlaybackIssueAnnouncementAt = 0;
  state.player.lastPlaybackIssueAnnouncementKey = "";
}

function getPlaybackIssueAnnouncementKey(reason) {
  return [
    state.session.clientId,
    getCurrentVideoSourceKey(),
    reason,
  ].join(":");
}

function getCurrentVideoSourceKey() {
  return String(
    dom.videoPlayer.currentSrc ||
    dom.videoPlayer.getAttribute("src") ||
    dom.videoUrlInput.value.trim() ||
    "",
  );
}

function getPlaybackSnapshotTime() {
  const currentTime = Number(dom.videoPlayer.currentTime);
  const lastKnownTime = Number(state.player.lastKnownTime || 0);
  const safeCurrentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  return Math.max(safeCurrentTime, lastKnownTime);
}

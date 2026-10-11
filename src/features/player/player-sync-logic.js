// Sincronizacion del player con la sala: estado remoto, aplicacion y publicacion.
import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js?v=20261010-file-size-refactor-02";
import {
  MAX_DRIFT_SECONDS,
  HARD_DRIFT_SECONDS,
  SEND_THROTTLE_MS,
  formatSeconds,
} from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { markParticipantActive, rememberParticipant } from "../presence.js?v=20261011-chat-ui-fixes-03";
import { sendVideoEventMessage } from "../chat/index.js?v=20261011-overlay-scroll-top-01";
import { configurePlaybackRecoveryPort, describePlaybackIssue, cancelPendingPlaybackIssueDetection, pauseRoomForPlaybackIssue, clearPlaybackRecoveryTracking, attemptPlaybackRecovery } from "./player-sync-recovery.js?v=20261011-overlay-scroll-top-01";
export { cancelPendingPlaybackIssueDetection, pauseRoomForPlaybackIssue, clearPlaybackRecoveryTracking, attemptPlaybackRecovery } from "./player-sync-recovery.js?v=20261011-overlay-scroll-top-01";
let playerMediaPort = null;

export function configurePlayerMediaPort(port) {
  if (!port?.clearVideoSource || !port?.setVideoSource || !port?.waitForVideoMetadata) {
    throw new TypeError("El puerto del reproductor requiere las operaciones de carga de medio.");
  }
  playerMediaPort = port;
}

function getPlayerMediaPort() {
  if (!playerMediaPort) {
    throw new Error("El puerto de medio debe configurarse antes de recibir estado remoto.");
  }
  return playerMediaPort;
}

const PLAYBACK_ISSUE_SYNC_COOLDOWN_MS = 2200;
// Los eventos waiting/stalled también se disparan por pequeños saltos de red.
// Solo son una incidencia de sala si la falta de datos persiste este tiempo.
const REMOTE_HOLD_ISSUE_SUPPRESSION_MS = 2200;

function markRemoteSeekPending() {
  state.player.remoteSeekPending = true;
  if (state.player.remoteSeekTimeoutId) {
    window.clearTimeout(state.player.remoteSeekTimeoutId);
  }
  state.player.remoteSeekTimeoutId = window.setTimeout(() => {
    state.player.remoteSeekPending = false;
    state.player.remoteSeekTimeoutId = null;
  }, 3000);
}

export function handleRemoteState(statePayload) {
  if (!statePayload || statePayload.from === state.session.clientId) return;
  rememberParticipant(statePayload.from, statePayload.name);
  markParticipantActive(statePayload.from, statePayload.name);
  const isInitialRemoteState = !state.player.lastRemoteState;
  state.player.lastRemoteState = statePayload;
  logEvent(
    "sync:recv",
    `${statePayload.action || "evento"} de ${statePayload.name || "otro usuario"} en ${formatSeconds(statePayload.time)} (paused=${String(Boolean(statePayload.paused))}, sentAt=${String(statePayload.sentAt || 0)}).`,
  );

  state.player.lastActionAt = Date.now();
  state.player.lastActionAuthor = statePayload.from;

  applyRemoteState(statePayload, statePayload.action === "hold", { isInitialRemoteState });
}

async function applyRemoteState(statePayload, force = false, { isInitialRemoteState = false } = {}) {
  if (!statePayload.src && !dom.videoPlayer.currentSrc && !dom.videoPlayer.getAttribute("src")) return;
  const media = getPlayerMediaPort();

  state.player.suppressVideoEvents = true;
  state.player.remoteStateActive = true;
  if (statePayload.action === "hold") {
    state.player.remotePlaybackIssueCooldownUntil = Date.now() + REMOTE_HOLD_ISSUE_SUPPRESSION_MS;
  }
  try {
    if (statePayload.action === "video" && !statePayload.src) {
      media.clearVideoSource(false);
      setSyncStatus(getRemoteStatusText(statePayload));
      logEvent("sync:apply", "Video quitado para la sala.");
      return;
    }
    const sourceIsDifferent =
      statePayload.src &&
      statePayload.src !== dom.videoPlayer.currentSrc &&
      statePayload.src !== dom.videoPlayer.src;
    // El primer estado remoto describe el contenido actual de la sala; si la
    // fuente ya coincide con la que está cargada localmente, no hay que
    // reiniciar el reproductor al entrar. Las recargas posteriores siguen
    // aplicándose como antes.
    const isNewVideoEvent = statePayload.action === "video" && !isInitialRemoteState;
    if (statePayload.src && (sourceIsDifferent || isNewVideoEvent)) {
      media.setVideoSource(statePayload.src, false, {
        // Cada participante anuncia su propia finalizacion de carga, porque
        // los tiempos pueden ser diferentes en cada navegador.
        announceLoadCompletion: true,
        animateSystemGroups: false,
      });
      await media.waitForVideoMetadata().catch(() => {});
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
      markRemoteSeekPending();
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
    // currentSrc puede conservar brevemente la fuente anterior durante un
    // cambio de video. La fuente declarada es la intención actual del usuario
    // y evita publicar nuevamente el video de prueba.
    src: getSyncVideoSource(),
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
  return getSyncVideoSource();
}

function getSyncVideoSource() {
  return String(
    dom.videoPlayer.getAttribute("src") ||
    dom.videoPlayer.src ||
    dom.videoUrlInput.value.trim() ||
    "",
  );
}

function getPlaybackSnapshotTime() {
  const currentTime = Number(dom.videoPlayer.currentTime);
  const safeCurrentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  // El tiempo actual es la fuente de verdad: usar max() con lastKnownTime
  // reintroduce una posición vieja cuando el usuario busca hacia atrás.
  return safeCurrentTime;
}

configurePlaybackRecoveryPort({
  publishState,
  getPlaybackSnapshotTime,
  shouldAnnouncePlaybackIssue,
  clearPlaybackIssueAnnouncementTracking,
});

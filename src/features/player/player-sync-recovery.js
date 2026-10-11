import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, getDisplayName, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { renderMessage } from "../chat/index.js?v=20261011-overlay-scroll-top-01";
import { setSyncStatus } from "../session-ui.js?v=20261010-file-size-refactor-02";

const PLAYBACK_ISSUE_SYNC_COOLDOWN_MS = 2200;
const PLAYBACK_ISSUE_CONFIRMATION_MS = 1800;
const PAUSE_TO_ISSUE_GRACE_MS = 900;
const SEEK_TO_ISSUE_GRACE_MS = 1400;
const PLAYBACK_RECOVERY_TIMEOUT_MS = 5 * 60 * 1000;

let playbackRecoveryPort = null;

export function configurePlaybackRecoveryPort(port) {
  if (!port?.publishState || !port?.getPlaybackSnapshotTime || !port?.shouldAnnouncePlaybackIssue || !port?.clearPlaybackIssueAnnouncementTracking) {
    throw new TypeError("El puerto de sincronización debe incluir publicación y seguimiento de recuperación.");
  }
  playbackRecoveryPort = port;
}

function getPlaybackRecoveryPort() {
  if (!playbackRecoveryPort) throw new Error("El puerto de recuperación todavía no fue configurado.");
  return playbackRecoveryPort;
}

export function describePlaybackIssue(reason) {
  if (reason === "waiting") return "espera de carga";
  if (reason === "stalled") return "video trabado";
  if (reason === "error") return "error de reproducción";
  return "un problema de reproducción";
}

export function cancelPendingPlaybackIssueDetection() {
  if (state.player.playbackIssueDetectionTimerId) {
    window.clearTimeout(state.player.playbackIssueDetectionTimerId);
  }
  state.player.playbackIssueDetectionTimerId = null;
  state.player.playbackIssueDetectionReason = "";
}

export function pauseRoomForPlaybackIssue(reason, options = {}) {
  const confirmed = Boolean(options.confirmed);
  if (state.player.remoteStateActive || state.player.suppressVideoEvents) return;
  if (!dom.videoPlayer.currentSrc && !dom.videoPlayer.src && !dom.videoUrlInput.value.trim()) return;
  if (dom.videoPlayer.ended) return;
  if (reason !== "error" && dom.videoPlayer.paused) return;

  if (!confirmed && (reason === "waiting" || reason === "stalled")) {
    if (state.player.playbackIssueDetectionReason === reason && state.player.playbackIssueDetectionTimerId) {
      return;
    }
    cancelPendingPlaybackIssueDetection();
    state.player.playbackIssueDetectionReason = reason;
    state.player.playbackIssueDetectionTimerId = window.setTimeout(() => {
      state.player.playbackIssueDetectionTimerId = null;
      state.player.playbackIssueDetectionReason = "";
      pauseRoomForPlaybackIssue(reason, { confirmed: true });
    }, PLAYBACK_ISSUE_CONFIRMATION_MS);
    logEvent(
      "sync:issue",
      `Esperando ${PLAYBACK_ISSUE_CONFIRMATION_MS} ms para confirmar incidencia (${reason}).`,
    );
    return;
  }

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
  const issueTime = getPlaybackRecoveryPort().getPlaybackSnapshotTime();
  const shouldAnnounceIssue = getPlaybackRecoveryPort().shouldAnnouncePlaybackIssue(reason);

  // Fuera de una sala no hay un evento remoto que pueda devolver el aviso;
  // dentro de una sala lo renderiza inmediatamente sendVideoEventMessage.
  if (shouldAnnounceIssue && (!state.session.activeRoom || !state.session.transport)) {
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
  getPlaybackRecoveryPort().publishState("hold", {
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
  cancelPendingPlaybackIssueDetection();
  getPlaybackRecoveryPort().clearPlaybackIssueAnnouncementTracking();
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

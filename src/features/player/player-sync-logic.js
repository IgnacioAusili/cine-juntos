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
  SEND_THROTTLE_MS,
  formatSeconds,
} from "../../core/utils.js";
import { rememberParticipant } from "../presence.js";
import { setSyncStatus } from "../session-ui.js";
import { sendVideoEventMessage, renderMessage } from "../chat/index.js";
// Import circular intencional y seguro: estas funciones se invocan en runtime,
// no durante la carga del modulo, y player.js a su vez importa publishState.
import { setVideoSource, waitForVideoMetadata } from "./player.js";

const PLAYBACK_ISSUE_SYNC_COOLDOWN_MS = 2200;

export function handleRemoteState(statePayload) {
  if (!statePayload || statePayload.from === state.session.clientId) return;
  rememberParticipant(statePayload.from, statePayload.name);
  state.player.lastRemoteState = statePayload;
  logEvent("sync:recv", `${statePayload.action || "evento"} de ${statePayload.name || "otro usuario"} en ${formatSeconds(statePayload.time)}.`);

  state.player.lastActionAt = Date.now();
  state.player.lastActionAuthor = statePayload.from;

  applyRemoteState(statePayload, statePayload.action === "hold");
}

async function applyRemoteState(statePayload, force = false) {
  if (!statePayload.src && !dom.videoPlayer.currentSrc) return;

  state.player.suppressVideoEvents = true;
  state.player.remoteStateActive = true;
  try {
    if (statePayload.src && statePayload.src !== dom.videoPlayer.currentSrc && statePayload.src !== dom.videoPlayer.src) {
      setVideoSource(statePayload.src, false);
      await waitForVideoMetadata().catch(() => {});
    }

    const targetTime = getRemoteTargetTime(statePayload);
    if (Number.isFinite(targetTime) && (force || Math.abs(dom.videoPlayer.currentTime - targetTime) > MAX_DRIFT_SECONDS)) {
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
  if (reason === "error") return "error de reproduccion";
  return "un problema de reproduccion";
}

export function pauseRoomForPlaybackIssue(reason) {
  if (state.player.remoteStateActive || state.player.suppressVideoEvents) return;
  if (!dom.videoPlayer.currentSrc && !dom.videoPlayer.src && !dom.videoUrlInput.value.trim()) return;
  if (dom.videoPlayer.ended) return;
  if (reason !== "error" && dom.videoPlayer.paused) return;

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

  // Mostrar aviso en el chat local siempre, independientemente de si hay sala activa.
  const displayName = state.session.displayName || "Vos";
  const issueText = `${displayName} ${describePlaybackIssueChat(reason)}`;
  renderMessage({
    id: `issue-${localNow}-${reason}`,
    from: state.session.clientId,
    name: displayName,
    text: issueText,
    system: true,
    createdAt: localNow,
  });

  if (!state.session.activeRoom || !state.session.transport) return;

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
  });
}

function describePlaybackIssueChat(reason) {
  if (reason === "waiting") return "está cargando el video";
  if (reason === "stalled") return "tiene el video trabado";
  if (reason === "error") return "tiene un error en el video";
  return "tiene un problema con el video";
}

export function publishState(action, overrides = {}) {
  if (!state.session.activeRoom || !state.session.transport) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }

  if (state.player.remoteStateActive) return;

  const localNow = Date.now();

  if (
    action !== "hold" &&
    state.player.lastActionAuthor &&
    state.player.lastActionAuthor !== state.session.clientId &&
    (localNow - state.player.lastActionAt < 2000)
  ) {
    logEvent("antilag", `Acción '${action}' bloqueada temporalmente (cooldown de otro usuario activo).`);
    setSyncStatus("Espera 2s para interactuar (cooldown).");

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

  const syncNow = getTransportNow();
  const payload = {
    action,
    from: state.session.clientId,
    name: getDisplayName(),
    src: dom.videoPlayer.currentSrc || dom.videoPlayer.src || dom.videoUrlInput.value.trim(),
    time: Number(dom.videoPlayer.currentTime || 0),
    paused: dom.videoPlayer.paused,
    rate: Number(dom.videoPlayer.playbackRate || 1),
    sentAt: syncNow,
    ...overrides,
  };

  state.session.transport.sendState(payload).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar sincronizacion: ${error.message || error}`);
    setSyncStatus("No se pudo enviar la sincronizacion.");
  });
  sendVideoEventMessage(action, payload);
  logEvent("sync:send", `${action} en ${formatSeconds(payload.time)} (${payload.paused ? "pausado" : "play"}).`);
}

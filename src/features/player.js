import {
  dom,
} from "../core/dom.js";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../core/state.js";
import {
  MAX_DRIFT_SECONDS,
  SEND_THROTTLE_MS,
  formatSeconds,
} from "../core/utils.js";
import {
  hydrateIcons,
} from "./ui.js";
import { rememberParticipant } from "./presence.js";
import { setSyncStatus } from "./session-ui.js";
import { sendVideoEventMessage } from "./chat.js";

export function initializePlayer() {
  setVideoStatus("empty", "Sin contenido");
}

export function wirePlayerCoreEvents() {
  dom.loadVideoButton.addEventListener("click", () => {
    loadVideoFromUrl(dom.videoUrlInput.value.trim(), "manual");
  });

  dom.videoPlayer.addEventListener("play", () => {
    logEvent("video", `Play local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!state.player.suppressVideoEvents) publishState("play");
  });

  dom.videoPlayer.addEventListener("pause", () => {
    if (dom.videoPlayer.ended) return;
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!state.player.suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("ended", () => {
    logEvent("video", "Video terminado.");
  });

  dom.videoPlayer.addEventListener("seeked", () => {
    logEvent("video", `Seek local a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!state.player.suppressVideoEvents) publishState("seek");
  });

  dom.videoPlayer.addEventListener("ratechange", () => {
    logEvent("video", `Velocidad local ${dom.videoPlayer.playbackRate}x.`);
    if (!state.player.suppressVideoEvents) publishState("rate");
  });

  dom.videoPlayer.addEventListener("loadedmetadata", () => {
    dom.emptyPlayer.classList.add("hidden");
    setVideoStatus("loaded", "Incorporado en sala");
  });

  dom.videoPlayer.addEventListener("error", () => {
    setVideoStatus("error", "Error");
    logEvent("error", "El navegador no pudo cargar el video.");
  });
}

export function handleRemoteState(statePayload) {
  if (!statePayload || statePayload.from === state.session.clientId) return;
  rememberParticipant(statePayload.from, statePayload.name);
  state.player.lastRemoteState = statePayload;
  logEvent("sync:recv", `${statePayload.action || "evento"} de ${statePayload.name || "otro usuario"} en ${formatSeconds(statePayload.time)}.`);

  state.player.lastActionAt = Date.now();
  state.player.lastActionAuthor = statePayload.from;

  applyRemoteState(statePayload);
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

    setSyncStatus(`Sincronizado con ${statePayload.name || "la sala"}.`);
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

export function publishState(action) {
  if (!state.session.activeRoom || !state.session.transport) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }

  if (state.player.remoteStateActive) return;

  const localNow = Date.now();

  if (
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

  if (localNow - state.player.lastStateSentAt < SEND_THROTTLE_MS && action !== "video" && action !== "sync") return;

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
  };

  state.session.transport.sendState(payload).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar sincronizacion: ${error.message || error}`);
    setSyncStatus("No se pudo enviar la sincronizacion.");
  });
  sendVideoEventMessage(action, payload);
  logEvent("sync:send", `${action} en ${formatSeconds(payload.time)} (${payload.paused ? "pausado" : "play"}).`);
}

export function loadVideoFromUrl(source, origin) {
  if (!source) {
    setVideoStatus("empty", "Sin contenido");
    logEvent("video", "No se cargo video: falta URL.");
    return;
  }

  setVideoSource(source, true);
  logEvent("video", `Video ${origin} cargado: ${source}`);
  if (state.session.activeRoom && state.session.transport) {
    publishState("video");
  }
}

export function setVideoSource(source, shouldAnnounce) {
  dom.videoPlayer.src = source;
  setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  dom.emptyPlayer.classList.add("hidden");
  dom.videoUrlInput.value = source;
  if (shouldAnnounce) logEvent("video", "Carga de video iniciada.");
}

export function setVideoStatus(videoState, text) {
  const iconByState = {
    empty: "circle",
    loading: "refresh-cw",
    loaded: "check-circle",
    error: "circle-alert",
  };
  dom.syncStatus.className = `sync-status video-status ${videoState}`;
  dom.videoStatusText.textContent = text;
  dom.videoStatusIcon.setAttribute("data-lucide", iconByState[videoState] || "circle");
  dom.videoStatusIcon.innerHTML = "";
  hydrateIcons();
}

export function waitForVideoMetadata() {
  if (Number.isFinite(dom.videoPlayer.duration)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    dom.videoPlayer.addEventListener("loadedmetadata", done, { once: true });
    dom.videoPlayer.addEventListener("error", done, { once: true });
  });
}

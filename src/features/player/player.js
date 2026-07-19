import {
  dom,
} from "../../core/dom.js";
import {
  state,
  logEvent,
} from "../../core/state.js";
import {
  formatSeconds,
} from "../../core/utils.js";
import {
  hydrateIcons,
} from "../icons-tooltips.js";
// Import circular intencional y seguro: estas funciones se invocan en runtime,
// no durante la carga del modulo, y player-sync-logic.js a su vez importa
// setVideoSource y waitForVideoMetadata desde aqui.
import {
  pauseRoomForPlaybackIssue,
  publishState,
} from "./player-sync-logic.js";

import { showErrorDialog, showLoadReplaceDialog } from "../session-ui.js";

const SKIP_LOAD_REPLACE_DIALOG_KEY = "cine-juntos-skip-load-replace-dialog";

export function initializePlayer() {
  setVideoStatus("empty", "Sin contenido");
  syncPlayerControls(true);
}

export function wirePlayerCoreEvents() {
  dom.loadVideoButton.addEventListener("click", async () => {
    await handleManualLoadRequest();
  });

  dom.playerPlayButton?.addEventListener("click", () => {
    togglePlaybackFromControls();
  });

  dom.playerSeekInput?.addEventListener("input", () => {
    previewSeekPosition();
  });

  dom.playerSeekInput?.addEventListener("change", () => {
    commitSeekPosition();
  });

  dom.playerRateSelect?.addEventListener("change", () => {
    const nextRate = Number(dom.playerRateSelect.value);
    if (!Number.isFinite(nextRate) || nextRate <= 0) return;
    dom.videoPlayer.playbackRate = nextRate;
    syncPlayerControls();
  });

  dom.playerMuteButton?.addEventListener("click", () => {
    dom.videoPlayer.muted = !dom.videoPlayer.muted;
    syncPlayerControls();
  });

  dom.playerVolumeInput?.addEventListener("input", () => {
    const vol = Number(dom.playerVolumeInput.value);
    if (Number.isFinite(vol)) {
      dom.videoPlayer.volume = vol;
      if (vol > 0 && dom.videoPlayer.muted) {
        dom.videoPlayer.muted = false;
      }
      dom.playerVolumeInput.style.setProperty("--volume-progress", `${vol * 100}%`);
      syncPlayerControls();
    }
  });

  dom.playerVolumeInput?.addEventListener("pointerup", () => {
    // Quitar el foco despues de ajustar para que la barra se cierre al alejar el cursor
    dom.playerVolumeInput.blur();
  });

  dom.playerVolumeGroup?.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = 0.05;
    const delta = e.deltaY < 0 ? step : -step;
    const newVol = Math.min(1, Math.max(0, dom.videoPlayer.volume + delta));
    dom.videoPlayer.volume = newVol;
    if (newVol > 0 && dom.videoPlayer.muted) dom.videoPlayer.muted = false;
    syncPlayerControls();
  }, { passive: false });

  dom.videoPlayer.addEventListener("volumechange", () => {
    syncPlayerControls();
  });

  dom.videoPlayer.addEventListener("play", () => {
    logEvent("video", `Play local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("play");
  });

  dom.videoPlayer.addEventListener("pause", () => {
    if (dom.videoPlayer.ended) return;
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("ended", () => {
    logEvent("video", "Video terminado.");
    syncPlayerControls(true);
  });

  dom.videoPlayer.addEventListener("seeked", () => {
    logEvent("video", `Seek local a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    syncPlayerControls(true);
    if (!state.player.suppressVideoEvents) publishState("seek");
  });

  dom.videoPlayer.addEventListener("ratechange", () => {
    logEvent("video", `Velocidad local ${dom.videoPlayer.playbackRate}x.`);
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("rate");
  });

  dom.videoPlayer.addEventListener("loadedmetadata", () => {
    dom.emptyPlayer.classList.add("hidden");
    setVideoStatus("loaded", "Incorporado en sala");
    syncPlayerControls(true);
  });

  dom.videoPlayer.addEventListener("durationchange", () => {
    syncPlayerControls(true);
  });

  dom.videoPlayer.addEventListener("timeupdate", () => {
    syncPlayerControls();
  });

  dom.videoPlayer.addEventListener("waiting", () => {
    logEvent("video", `Buffering local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    pauseRoomForPlaybackIssue("waiting");
  });

  dom.videoPlayer.addEventListener("stalled", () => {
    logEvent("video", `Video trabado localmente en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    pauseRoomForPlaybackIssue("stalled");
  });

  dom.videoPlayer.addEventListener("error", () => {
    setVideoStatus("error", "Error");
    logEvent("error", "El navegador no pudo cargar el video.");
    syncPlayerControls(true);
    pauseRoomForPlaybackIssue("error");
    
    // Mostrar diálogo de error al usuario
    const error = dom.videoPlayer.error;
    let details = "No se pudo cargar el video seleccionado. Por favor, verifica el formato o que el enlace sea accesible.";
    if (error) {
      if (error.code === 1) details = "La carga del video fue abortada.";
      else if (error.code === 2) details = "Error de red al intentar descargar el video.";
      else if (error.code === 3) details = "El video está corrupto o tiene un formato no soportado por tu navegador.";
      else if (error.code === 4) details = "No se pudo encontrar el video o el formato no es compatible.";
    }
    showErrorDialog(details);
  });

  dom.videoPlayer.addEventListener("emptied", () => {
    syncPlayerControls(true);
  });
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

async function handleManualLoadRequest() {
  const source = dom.videoUrlInput.value.trim();
  if (!source) {
    loadVideoFromUrl(source, "manual");
    return;
  }

  if (shouldConfirmLoadReplacement()) {
    const { confirmed, skipFutureWarnings } = await showLoadReplaceDialog(
      "Hay un video reproduciendose. ¿Seguro que queres cargar otro ahora?",
    );
    if (!confirmed) return;
    if (skipFutureWarnings) {
      localStorage.setItem(SKIP_LOAD_REPLACE_DIALOG_KEY, "1");
    }
  }

  loadVideoFromUrl(source, "manual");
}

export function setVideoSource(source, shouldAnnounce) {
  dom.videoPlayer.src = source;
  setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  dom.emptyPlayer.classList.add("hidden");
  dom.videoUrlInput.value = source;
  syncPlayerControls(true);
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

function togglePlaybackFromControls() {
  const hasMedia = hasLoadedMediaSource();
  if (!hasMedia) return;

  if (dom.videoPlayer.paused || dom.videoPlayer.ended) {
    dom.videoPlayer.play().catch(() => {});
    return;
  }

  dom.videoPlayer.pause();
}

function previewSeekPosition() {
  if (!dom.playerSeekInput) return;
  const nextTime = Number(dom.playerSeekInput.value);
  updateSeekVisuals(nextTime, getFiniteDuration());
  if (dom.playerCurrentTime) {
    dom.playerCurrentTime.textContent = formatSeconds(nextTime);
  }
}

function commitSeekPosition() {
  if (!dom.playerSeekInput) return;
  const nextTime = Number(dom.playerSeekInput.value);
  if (!Number.isFinite(nextTime)) return;
  dom.videoPlayer.currentTime = Math.max(0, nextTime);
  syncPlayerControls(true);
}

function syncPlayerControls(forceSliderSync = false) {
  const duration = getFiniteDuration();
  const currentTime = Number.isFinite(dom.videoPlayer.currentTime) ? Math.max(0, dom.videoPlayer.currentTime) : 0;
  const hasMedia = hasLoadedMediaSource();
  const isSeekingElementFocused = document.activeElement === dom.playerSeekInput;

  if (dom.playerCurrentTime) {
    dom.playerCurrentTime.textContent = formatSeconds(currentTime);
  }

  if (dom.playerDuration) {
    dom.playerDuration.textContent = formatSeconds(duration);
  }

  if (dom.playerSeekInput) {
    dom.playerSeekInput.max = String(duration || 0);
    dom.playerSeekInput.disabled = !hasMedia || duration <= 0;
    if (forceSliderSync || !isSeekingElementFocused) {
      // Si el video terminó, forzar el value al máximo para que el thumb llegue al final
      const seekValue = dom.videoPlayer.ended && duration > 0 ? duration : Math.min(currentTime, duration || 0);
      dom.playerSeekInput.value = String(seekValue);
    }
    updateSeekVisuals(Number(dom.playerSeekInput.value || 0), duration, dom.videoPlayer.ended);
  }

  if (dom.playerPlayButton) {
    dom.playerPlayButton.disabled = !hasMedia;
    const icon = dom.playerPlayButton.querySelector("[data-lucide]");
    const isPaused = dom.videoPlayer.paused || dom.videoPlayer.ended;
    const tooltip = isPaused ? "Reproducir video" : "Pausar video";
    dom.playerPlayButton.dataset.tooltip = tooltip;
    dom.playerPlayButton.setAttribute("aria-label", tooltip);
    dom.playerPlayButton.removeAttribute("title");
    if (icon) {
      const nextIcon = isPaused ? "play" : "pause";
      if (icon.getAttribute("data-lucide") !== nextIcon) {
        icon.setAttribute("data-lucide", nextIcon);
        icon.innerHTML = "";
        hydrateIcons();
      }
    }
  }

  if (dom.playerRateSelect) {
    dom.playerRateSelect.disabled = !hasMedia;
    dom.playerRateSelect.value = String(Number(dom.videoPlayer.playbackRate || 1));
  }

  if (dom.playerMuteButton) {
    const icon = dom.playerMuteButton.querySelector("[data-lucide]");
    const isMuted = dom.videoPlayer.muted || dom.videoPlayer.volume === 0;
    const nextIcon = isMuted ? "volume-x" : dom.videoPlayer.volume < 0.5 ? "volume-1" : "volume-2";
    if (icon && icon.getAttribute("data-lucide") !== nextIcon) {
      icon.setAttribute("data-lucide", nextIcon);
      icon.innerHTML = "";
      hydrateIcons();
    }
    const tooltip = isMuted ? "Activar sonido" : "Silenciar";
    dom.playerMuteButton.dataset.tooltip = tooltip;
    dom.playerMuteButton.setAttribute("aria-label", tooltip);
  }

  if (dom.playerVolumeInput) {
    const isFocused = document.activeElement === dom.playerVolumeInput;
    if (!isFocused) {
      dom.playerVolumeInput.value = String(dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume);
    }
    const currentVol = dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume;
    dom.playerVolumeInput.style.setProperty("--volume-progress", `${currentVol * 100}%`);
  }
}

function updateSeekVisuals(currentTime, duration, forceEnd = false) {
  if (!dom.playerSeekInput) return;
  const progress = forceEnd || (duration > 0 && currentTime >= duration)
    ? 100
    : duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  dom.playerSeekInput.style.setProperty("--player-progress", `${progress}%`);
}

function getFiniteDuration() {
  return Number.isFinite(dom.videoPlayer.duration) ? Math.max(0, dom.videoPlayer.duration) : 0;
}

function hasLoadedMediaSource() {
  return Boolean(dom.videoPlayer.currentSrc || dom.videoPlayer.getAttribute("src"));
}

function shouldConfirmLoadReplacement() {
  return isVideoCurrentlyPlaying() && localStorage.getItem(SKIP_LOAD_REPLACE_DIALOG_KEY) !== "1";
}

function isVideoCurrentlyPlaying() {
  return hasLoadedMediaSource() && !dom.videoPlayer.paused && !dom.videoPlayer.ended;
}

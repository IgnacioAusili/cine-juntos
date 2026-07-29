import {
  dom,
} from "../../core/dom.js";
import {
  state,
  getDisplayName,
  logEvent,
} from "../../core/state.js";
import {
  formatSeconds,
  formatClockTime,
  withShortcutHint,
} from "../../core/utils.js";
import {
  hydrateIcons,
} from "../icons-tooltips.js";
import { sendVideoEventMessage, setInsideChatVisible } from "../chat/index.js";
// Import circular intencional y seguro: estas funciones se invocan en runtime,
// no durante la carga del modulo, y player-sync-logic.js a su vez importa
// setVideoSource y waitForVideoMetadata desde aqui.
import {
  attemptPlaybackRecovery,
  clearPlaybackRecoveryTracking,
  pauseRoomForPlaybackIssue,
  publishState,
} from "./player-sync-logic.js";

import {
  showErrorDialog,
  showLoadReplaceDialog,
  showResumeVideoDialog,
  showSlowLoadDialog,
} from "../session-ui.js";
import { togglePageFullscreen } from "./fullscreen.js";

const SKIP_LOAD_REPLACE_DIALOG_KEY = "cine-juntos-skip-load-replace-dialog";
const VIDEO_RESUME_STORAGE_KEY = "cine-juntos-video-resume-times";
const SLOW_LOAD_DIALOG_DELAY_MS = 5 * 60 * 1000;
const MIN_RESUME_PROMPT_SECONDS = 5;
const KEYBOARD_SEEK_STEP_SECONDS = 10;
const KEYBOARD_VOLUME_STEP = 0.05;
let isDurationShowingRemaining = false;
let pendingLoadCompletionAnnouncement = false;

export function initializePlayer() {
  isDurationShowingRemaining = false;
  pendingLoadCompletionAnnouncement = false;
  clearSlowLoadPromptTracking();
  setVideoStatus("empty", "Sin contenido");
  syncPlayerControls(true);
}

export function wirePlayerCoreEvents() {
  document.addEventListener("keydown", handleGlobalPlayerKeydown, true);

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

  dom.playerDuration?.addEventListener("click", () => {
    const duration = getFiniteDuration();
    const hasMedia = hasLoadedMediaSource();
    if (!hasMedia || duration <= 0) return;
    isDurationShowingRemaining = !isDurationShowingRemaining;
    syncPlayerControls();
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
    rememberPlaybackPosition();
    persistPlaybackPosition();
    setVideoStatus("loaded", "En vivo");
    logEvent("video", `Play local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    syncPlayerControls();
    if (state.player.playbackRecoveryPending || state.player.playbackRecoveryAttempting) {
      clearPlaybackRecoveryTracking();
    }
    if (!state.player.suppressVideoEvents) publishState("play");
  });

  dom.videoPlayer.addEventListener("pause", () => {
    if (dom.videoPlayer.ended) return;
    rememberPlaybackPosition();
    persistPlaybackPosition(true);
    setVideoStatus("loaded", "Incorporado");
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    state.player.lastManualPauseAt = Date.now();
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("ended", () => {
    setVideoStatus("loaded", "Incorporado");
    logEvent("video", "Video terminado.");
    persistPlaybackPosition(true);
    syncPlayerControls(true);
  });

  dom.videoPlayer.addEventListener("seeked", () => {
    rememberPlaybackPosition();
    persistPlaybackPosition(true);
    logEvent("video", `Seek local a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    state.player.lastManualSeekAt = Date.now();
    syncPlayerControls(true);
    if (!state.player.suppressVideoEvents) publishState("seek");
  });

  dom.videoPlayer.addEventListener("ratechange", () => {
    logEvent("video", `Velocidad local ${dom.videoPlayer.playbackRate}x.`);
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("rate");
  });

  dom.videoPlayer.addEventListener("loadedmetadata", () => {
    isDurationShowingRemaining = false;
    dom.emptyPlayer.classList.add("hidden");
    setVideoStatus("loaded", "Incorporado");
    clearSlowLoadPromptTracking();
    announceVideoLoadCompletion();
    syncPlayerControls(true);
    void maybePromptResumePlayback();
    attemptPlaybackRecovery("loadedmetadata");
  });

  dom.videoPlayer.addEventListener("loadeddata", () => {
    attemptPlaybackRecovery("loadeddata");
  });

  dom.videoPlayer.addEventListener("canplay", () => {
    attemptPlaybackRecovery("canplay");
  });

  dom.videoPlayer.addEventListener("playing", () => {
    attemptPlaybackRecovery("playing");
  });

  dom.videoPlayer.addEventListener("durationchange", () => {
    syncPlayerControls(true);
  });

  dom.videoPlayer.addEventListener("timeupdate", () => {
    rememberPlaybackPosition();
    persistPlaybackPosition();
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
    clearSlowLoadPromptTracking();
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
    isDurationShowingRemaining = false;
    clearSlowLoadPromptTracking();
    syncPlayerControls(true);
  });
}

export function loadVideoFromUrl(source, origin) {
  if (!source) {
    setVideoStatus("empty", "Sin contenido");
    pendingLoadCompletionAnnouncement = false;
    state.player.resumePromptSource = "";
    clearSlowLoadPromptTracking();
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
  isDurationShowingRemaining = false;
  pendingLoadCompletionAnnouncement = Boolean(shouldAnnounce);
  state.player.resumePromptSource = shouldAnnounce ? getVideoSourceKey(source) : "";
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  dom.videoPlayer.src = source;
  setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  dom.emptyPlayer.classList.add("hidden");
  dom.videoUrlInput.value = source;
  syncPlayerControls(true);
  armSlowLoadPrompt(source);
  if (shouldAnnounce) logEvent("video", "Carga de video iniciada.");
}

function announceVideoLoadCompletion() {
  if (!pendingLoadCompletionAnnouncement) return;
  pendingLoadCompletionAnnouncement = false;
  if (!state.session.activeRoom || !state.session.transport) return;

  sendVideoEventMessage("video-ready", {
    from: state.session.clientId,
    name: getDisplayName(),
    time: Number(dom.videoPlayer.currentTime) || 0,
    rate: Number(dom.videoPlayer.playbackRate || 1),
  });
}

export function setVideoStatus(videoState, text) {
  dom.syncStatus.className = `sync-status video-status player-status-badge ${videoState}`;
  if (dom.videoStatusText) {
    dom.videoStatusText.textContent = text;
  }
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

function handleGlobalPlayerKeydown(event) {
  if (event.defaultPrevented) return;
  if (event.repeat) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const key = event.key;
  if (key === "Tab") {
    event.preventDefault();
    setInsideChatVisible(!dom.playerFrame.classList.contains("chat-inside-open"));
    return;
  }

  if (document.querySelector("dialog[open]")) return;
  if (dom.resumeVideoPopup && dom.resumeVideoPopup.hidden === false) return;
  if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;

  if (key === "f" || key === "F") {
    event.preventDefault();
    void togglePageFullscreen();
    return;
  }

  if (!hasLoadedMediaSource()) return;

  if (key === " " || key === "Spacebar") {
    event.preventDefault();
    togglePlaybackFromControls();
    return;
  }

  if (key === "m" || key === "M") {
    event.preventDefault();
    dom.videoPlayer.muted = !dom.videoPlayer.muted;
    syncPlayerControls();
    return;
  }

  if (key === "ArrowLeft") {
    event.preventDefault();
    seekVideoBy(-KEYBOARD_SEEK_STEP_SECONDS);
    return;
  }

  if (key === "ArrowRight") {
    event.preventDefault();
    seekVideoBy(KEYBOARD_SEEK_STEP_SECONDS);
    return;
  }

  if (key === "ArrowUp") {
    event.preventDefault();
    adjustVolumeBy(KEYBOARD_VOLUME_STEP);
    return;
  }

  if (key === "ArrowDown") {
    event.preventDefault();
    adjustVolumeBy(-KEYBOARD_VOLUME_STEP);
  }
}

function isEditableTarget(element) {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(
    element.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function seekVideoBy(deltaSeconds) {
  const duration = getFiniteDuration();
  const currentTime = Number.isFinite(dom.videoPlayer.currentTime)
    ? Math.max(0, dom.videoPlayer.currentTime)
    : 0;
  const nextTime = duration > 0
    ? Math.min(duration, Math.max(0, currentTime + deltaSeconds))
    : Math.max(0, currentTime + deltaSeconds);

  if (nextTime === currentTime) return;

  dom.videoPlayer.currentTime = nextTime;
  syncPlayerControls(true);
}

function adjustVolumeBy(delta) {
  const nextVolume = Math.min(1, Math.max(0, Number(dom.videoPlayer.volume || 0) + delta));
  dom.videoPlayer.volume = nextVolume;
  if (nextVolume > 0 && dom.videoPlayer.muted) {
    dom.videoPlayer.muted = false;
  }
  syncPlayerControls();
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
  const safeTime = Math.max(0, nextTime);
  state.player.lastKnownTime = safeTime;
  logEvent(
    "debug",
    `Seek local solicitado: input=${formatSeconds(nextTime)} safe=${formatSeconds(safeTime)} lastKnown=${formatSeconds(state.player.lastKnownTime)}.`,
  );
  dom.videoPlayer.currentTime = safeTime;
  syncPlayerControls(true);
}

function syncPlayerControls(forceSliderSync = false) {
  const duration = getFiniteDuration();
  const isEnded = dom.videoPlayer.ended;
  const currentTime = isEnded && duration > 0 
    ? duration 
    : Number.isFinite(dom.videoPlayer.currentTime) ? Math.max(0, dom.videoPlayer.currentTime) : 0;
  const hasMedia = hasLoadedMediaSource();
  const isSeekingElementFocused = document.activeElement === dom.playerSeekInput;
  const remainingTime = Math.max(0, duration - currentTime);
  const showRemainingDuration = isDurationShowingRemaining && hasMedia && duration > 0;

  if (dom.playerCurrentTime) {
    dom.playerCurrentTime.textContent = formatSeconds(currentTime);
  }

  if (dom.playerDuration) {
    dom.playerDuration.textContent = showRemainingDuration
      ? `-${formatSeconds(remainingTime)}`
      : formatSeconds(duration);
  }

  const isTimeDisabled = !hasMedia || duration <= 0;
  if (dom.playerCurrentTime) {
    dom.playerCurrentTime.dataset.disabled = isTimeDisabled ? "true" : "false";
  }
  if (dom.playerDuration) {
    dom.playerDuration.dataset.disabled = isTimeDisabled ? "true" : "false";
    dom.playerDuration.dataset.mode = showRemainingDuration ? "remaining" : "total";
    dom.playerDuration.disabled = isTimeDisabled;
    const durationTooltip = isTimeDisabled
      ? ""
      : showRemainingDuration
        ? "Mostrar duración total"
        : "Mostrar tiempo restante";
    if (durationTooltip) {
      dom.playerDuration.dataset.tooltip = durationTooltip;
    } else {
      dom.playerDuration.removeAttribute("data-tooltip");
    }
    dom.playerDuration.removeAttribute("title");
    dom.playerDuration.setAttribute("aria-label", durationTooltip);
    dom.playerDuration.setAttribute("aria-pressed", showRemainingDuration ? "true" : "false");
  }

  if (dom.playerSeekInput) {
    dom.playerSeekInput.max = String(duration || 0);
    dom.playerSeekInput.disabled = !hasMedia || duration <= 0;
    if (forceSliderSync || !isSeekingElementFocused) {
      // Si el video terminó, forzar el value al máximo exacto para que el thumb llegue hasta el final
      const seekValue = isEnded && duration > 0 ? duration : Math.min(currentTime, duration || 0);
      dom.playerSeekInput.value = String(seekValue);
    }
    updateSeekVisuals(Number(dom.playerSeekInput.value || 0), duration, isEnded);
  }

  if (dom.playerPlayButton) {
    dom.playerPlayButton.disabled = !hasMedia;
    const icon = dom.playerPlayButton.querySelector("[data-lucide]");
    const isPaused = dom.videoPlayer.paused || dom.videoPlayer.ended;
    const tooltip = withShortcutHint(isPaused ? "Reproducir video" : "Pausar video", "Espacio");
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
    const rateSelectWrap = dom.playerRateSelect.closest(".player-select");
    if (rateSelectWrap) {
      rateSelectWrap.dataset.disabled = dom.playerRateSelect.disabled ? "true" : "false";
    }
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
    const tooltip = withShortcutHint(isMuted ? "Activar sonido" : "Silenciar", "M");
    dom.playerMuteButton.dataset.tooltip = tooltip;
    dom.playerMuteButton.setAttribute("aria-label", tooltip);
    dom.playerMuteButton.removeAttribute("title");
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

function rememberPlaybackPosition() {
  const currentTime = Number(dom.videoPlayer.currentTime);
  if (Number.isFinite(currentTime)) {
    state.player.lastKnownTime = Math.max(0, currentTime);
  }
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

function clearSlowLoadPromptTracking() {
  if (state.player.slowLoadPromptTimeoutId) {
    window.clearTimeout(state.player.slowLoadPromptTimeoutId);
  }
  state.player.slowLoadPromptTimeoutId = null;
  state.player.slowLoadPromptSource = "";
}

function armSlowLoadPrompt(source) {
  const sourceKey = getVideoSourceKey(source);
  if (!sourceKey) return;

  state.player.slowLoadPromptSource = sourceKey;
  state.player.slowLoadPromptTimeoutId = window.setTimeout(async () => {
    const activeSource = getCurrentVideoSourceKey();
    const stillLoading = !dom.videoPlayer.error && !dom.videoPlayer.ended && (
      dom.videoPlayer.networkState === HTMLMediaElement.NETWORK_LOADING ||
      dom.videoPlayer.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
    );

    if (!activeSource || activeSource !== sourceKey || !stillLoading) {
      return;
    }

    clearSlowLoadPromptTracking();
    const confirmed = await showSlowLoadDialog(
      "Vaya, parece que esta tardando en cargar. ¿Quieres intentar recargar el video solo para ti?",
    );
    if (confirmed && getCurrentVideoSourceKey() === sourceKey) {
      reloadVideoLocally();
    }
  }, SLOW_LOAD_DIALOG_DELAY_MS);
}

function reloadVideoLocally() {
  const source = getCurrentVideoSourceKey();
  if (!source) return;

  clearSlowLoadPromptTracking();
  setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  syncPlayerControls(true);
  logEvent("video", "Recarga local del video solicitada.");
  armSlowLoadPrompt(source);
}

async function maybePromptResumePlayback() {
  const sourceKey = getCurrentVideoSourceKey();
  if (!sourceKey || state.player.resumePromptSource !== sourceKey) {
    state.player.resumePromptSource = "";
    return;
  }

  const resumeTime = getStoredResumeTime(sourceKey);
  state.player.resumePromptSource = "";
  if (!Number.isFinite(resumeTime) || resumeTime < MIN_RESUME_PROMPT_SECONDS) {
    return;
  }

  const confirmed = await showResumeVideoDialog(
    `Este video ya lo habías dejado en ${formatClockTime(resumeTime)}. ¿Quieres saltar a ese tiempo anterior?`,
  );
  if (!confirmed || getCurrentVideoSourceKey() !== sourceKey) return;

  jumpToResumeTime(resumeTime);
}

function jumpToResumeTime(resumeTime) {
  const safeTime = Math.max(0, Number(resumeTime) || 0);
  const previousSuppress = state.player.suppressVideoEvents;
  state.player.suppressVideoEvents = true;
  const restoreSuppression = () => {
    if (!state.player.remoteStateActive) {
      state.player.suppressVideoEvents = previousSuppress;
    }
  };
  dom.videoPlayer.addEventListener("seeked", restoreSuppression, { once: true });
  try {
    dom.videoPlayer.currentTime = safeTime;
    state.player.lastKnownTime = safeTime;
    syncPlayerControls(true);
    logEvent("video", `Reanudación local en ${formatSeconds(safeTime)}.`);
  } finally {
    window.setTimeout(() => {
      restoreSuppression();
    }, 280);
  }
}

function persistPlaybackPosition(force = false) {
  const sourceKey = getCurrentVideoSourceKey();
  if (!sourceKey) return;

  const currentTime = Number(dom.videoPlayer.currentTime);
  if (!Number.isFinite(currentTime)) return;

  const safeTime = Math.max(0, currentTime);
  if (!force && safeTime < MIN_RESUME_PROMPT_SECONDS) return;
  if (!force && Date.now() - state.player.lastResumePersistAt < 5000) return;

  state.player.lastResumePersistAt = Date.now();
  setStoredResumeTime(sourceKey, safeTime);
}

function getStoredResumeTime(sourceKey) {
  const store = readResumeStore();
  const time = Number(store[sourceKey]);
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function setStoredResumeTime(sourceKey, time) {
  const store = readResumeStore();
  const safeTime = Math.max(0, Number(time) || 0);
  if (!safeTime) {
    delete store[sourceKey];
  } else {
    store[sourceKey] = safeTime;
  }

  try {
    localStorage.setItem(VIDEO_RESUME_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("No se pudo guardar el tiempo de reanudación del video:", error);
  }
}

function readResumeStore() {
  try {
    const raw = localStorage.getItem(VIDEO_RESUME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getCurrentVideoSourceKey() {
  return getVideoSourceKey(
    dom.videoPlayer.currentSrc ||
    dom.videoPlayer.getAttribute("src") ||
    dom.videoUrlInput.value.trim(),
  );
}

function getVideoSourceKey(source) {
  const normalized = String(source || "").trim();
  if (!normalized) return "";

  try {
    return new URL(normalized, window.location.href).href;
  } catch {
    return normalized;
  }
}

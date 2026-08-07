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
  PLAYBACK_ERROR_CONFIRMATION_MS,
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
const PLAYER_VOLUME_STORAGE_KEY = "cine-juntos-player-volume";
const SLOW_LOAD_DIALOG_DELAY_MS = 5 * 60 * 1000;
const VIDEO_LOAD_COOLDOWN_MS = 3500;
const PLAY_BUTTON_BURST_WINDOW_MS = 1000;
const PLAY_BUTTON_BURST_LIMIT = 4;
const PLAY_BUTTON_COOLDOWN_MS = 30000;
const MIN_RESUME_PROMPT_SECONDS = 5;
const KEYBOARD_SEEK_STEP_SECONDS = 10;
const KEYBOARD_VOLUME_STEP = 0.05;
let isDurationShowingRemaining = false;
let pendingLoadCompletionAnnouncement = false;

export function initializePlayer() {
  isDurationShowingRemaining = false;
  pendingLoadCompletionAnnouncement = false;
  clearSlowLoadPromptTracking();
  const persistedVolume = readPersistedVolume();
  if (persistedVolume !== null) {
    dom.videoPlayer.volume = persistedVolume;
  }
  setVideoStatus("empty", "Sin contenido");
  syncPlayerControls(true);
}

export function wirePlayerCoreEvents() {
  document.addEventListener("keydown", handleGlobalPlayerKeydown, true);

  dom.loadVideoButton.addEventListener("click", async () => {
    await handleManualLoadRequest();
  });

  dom.playerPlayButton?.addEventListener("click", () => {
    togglePlaybackFromControls("button");
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
    persistVolume(dom.videoPlayer.volume);
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
    clearPlaybackErrorTracking();
    clearSlowLoadPromptTracking();
    announceVideoLoadCompletion();
    syncPlayerControls(true);
    void maybePromptResumePlayback();
    attemptPlaybackRecovery("loadedmetadata");
  });

  dom.videoPlayer.addEventListener("loadeddata", () => {
    clearPlaybackErrorTracking();
    attemptPlaybackRecovery("loadeddata");
  });

  dom.videoPlayer.addEventListener("canplay", () => {
    clearPlaybackErrorTracking();
    attemptPlaybackRecovery("canplay");
  });

  dom.videoPlayer.addEventListener("playing", () => {
    clearPlaybackErrorTracking();
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
    schedulePlaybackErrorConfirmation();
  });

  dom.videoPlayer.addEventListener("emptied", () => {
    isDurationShowingRemaining = false;
    clearPlaybackErrorTracking();
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

  // El valor inicial del input puede contener una URL de ejemplo, pero eso no
  // significa que ya haya un video cargado. Para detectar una recarga hay que
  // comparar únicamente contra la fuente real del reproductor.
  const currentSourceKey = getLoadedVideoSourceKey();
  const nextSourceKey = getVideoSourceKey(source);
  const isReload = Boolean(currentSourceKey && currentSourceKey === nextSourceKey);
  setVideoSource(source, true, { isReload });
  logEvent("video", `Video ${isReload ? "recargado" : `${origin} cargado`}: ${source}`);
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

  if (isVideoLoadCoolingDown()) {
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

export function setVideoSource(source, shouldAnnounce, options = {}) {
  isDurationShowingRemaining = false;
  pendingLoadCompletionAnnouncement = Boolean(
    options.announceLoadCompletion ?? shouldAnnounce,
  );
  const isReload = Boolean(options.isReload);
  state.player.lastVideoLoadWasReload = isReload;
  state.player.resumePromptSource = shouldAnnounce ? getVideoSourceKey(source) : "";
  window.clearTimeout(state.player.videoLoadCooldownTimeoutId);
  state.player.videoLoadCooldownUntil = Date.now() + VIDEO_LOAD_COOLDOWN_MS;
  state.player.videoLoadCooldownTimeoutId = window.setTimeout(() => {
    state.player.videoLoadCooldownUntil = 0;
    state.player.videoLoadCooldownTimeoutId = null;
    updateLoadButtonState();
  }, VIDEO_LOAD_COOLDOWN_MS);
  clearPlaybackErrorTracking();
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  dom.videoPlayer.src = source;
  setVideoStatus("loading", isReload ? "Recargando video" : "Cargando video");
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
    isReload: Boolean(state.player.lastVideoLoadWasReload),
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

function togglePlaybackFromControls(source = "keyboard") {
  const hasMedia = hasLoadedMediaSource();
  if (!hasMedia) return;

  const now = Date.now();
  if (source === "button") {
    if (isPlayButtonCoolingDown(now)) return;
    state.player.playButtonPressTimes = (state.player.playButtonPressTimes || [])
      .filter((pressedAt) => now - pressedAt <= PLAY_BUTTON_BURST_WINDOW_MS);
    state.player.playButtonPressTimes.push(now);
  }

  const wasPlaying = !dom.videoPlayer.paused && !dom.videoPlayer.ended;
  if (source === "button" && wasPlaying) {
    // Solo una pausa iniciada desde este botón puede activar el bloqueo.
    state.player.lastUserPauseAt = now;
  }

  if (dom.videoPlayer.paused || dom.videoPlayer.ended) {
    dom.videoPlayer.play().catch(() => {});
  } else {
    dom.videoPlayer.pause();
  }

  if (
    source === "button" &&
    state.player.playButtonPressTimes.length >= PLAY_BUTTON_BURST_LIMIT &&
    now - Number(state.player.lastUserPauseAt || 0) <= PLAY_BUTTON_BURST_WINDOW_MS
  ) {
    activatePlayButtonCooldown(now);
  }
}

function isPlayButtonCoolingDown(now = Date.now()) {
  return now < Number(state.player.playButtonCooldownUntil || 0);
}

function activatePlayButtonCooldown(now = Date.now()) {
  state.player.playButtonCooldownUntil = now + PLAY_BUTTON_COOLDOWN_MS;
  state.player.playButtonPressTimes = [];
  window.clearInterval(state.player.playButtonCooldownTimeoutId);
  state.player.playButtonCooldownTimeoutId = window.setInterval(() => {
    if (!isPlayButtonCoolingDown()) {
      state.player.playButtonCooldownUntil = 0;
      window.clearInterval(state.player.playButtonCooldownTimeoutId);
      state.player.playButtonCooldownTimeoutId = null;
    }
    syncPlayerControls();
  }, 1000);
  syncPlayerControls();
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

function readPersistedVolume() {
  try {
    const storedVolume = Number(localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY));
    if (!Number.isFinite(storedVolume)) return null;
    return Math.min(1, Math.max(0, storedVolume));
  } catch {
    return null;
  }
}

function persistVolume(volume) {
  const safeVolume = Number(volume);
  if (!Number.isFinite(safeVolume)) return;

  try {
    localStorage.setItem(
      PLAYER_VOLUME_STORAGE_KEY,
      String(Math.min(1, Math.max(0, safeVolume))),
    );
  } catch {
    // El reproductor sigue funcionando aunque el almacenamiento no esté disponible.
  }
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
    const playButtonCoolingDown = isPlayButtonCoolingDown();
    dom.playerPlayButton.disabled = !hasMedia || playButtonCoolingDown;
    const isPaused = dom.videoPlayer.paused || dom.videoPlayer.ended;
    const cooldownSeconds = Math.max(
      1,
      Math.ceil((Number(state.player.playButtonCooldownUntil || 0) - Date.now()) / 1000),
    );
    if (playButtonCoolingDown) {
      if (dom.playerPlayButton.dataset.playButtonCooldown !== "true") {
        dom.playerPlayButton.dataset.playButtonCooldown = "true";
        dom.playerPlayButton.innerHTML = "<span class=\"play-button-cooldown\" aria-hidden=\"true\"></span>";
      }
      const counter = dom.playerPlayButton.querySelector(".play-button-cooldown");
      if (counter) counter.textContent = String(cooldownSeconds);
    } else if (dom.playerPlayButton.dataset.playButtonCooldown === "true") {
      delete dom.playerPlayButton.dataset.playButtonCooldown;
      dom.playerPlayButton.innerHTML = `<span data-lucide=\"${isPaused ? "play" : "pause"}\"></span>`;
      hydrateIcons();
    }
    const icon = dom.playerPlayButton.querySelector("[data-lucide]");
    const tooltip = playButtonCoolingDown
      ? `Espera ${cooldownSeconds}s para usar el reproductor`
      : withShortcutHint(isPaused ? "Reproducir video" : "Pausar video", "Espacio");
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

  updateLoadButtonState();
}

function updateLoadButtonState() {
  if (!dom.loadVideoButton) return;
  const coolingDown = isVideoLoadCoolingDown();
  dom.loadVideoButton.disabled = coolingDown;
  dom.loadVideoButton.dataset.loading = coolingDown ? "true" : "false";
  if (!coolingDown) {
    delete dom.loadVideoButton.dataset.loading;
    dom.loadVideoButton.removeAttribute("aria-busy");
    return;
  }
  dom.loadVideoButton.setAttribute("aria-busy", "true");
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

function isVideoLoadCoolingDown() {
  return Date.now() < Number(state.player.videoLoadCooldownUntil || 0);
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
  clearPlaybackErrorTracking();
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
    `Este video ya lo has reproducido antes en <span class="resume-time-tag">${formatClockTime(resumeTime)}</span> ¿Quieres retomar desde ahí?`,
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

function schedulePlaybackErrorConfirmation() {
  const snapshot = capturePlaybackErrorSnapshot();
  if (!snapshot) return;

  clearPlaybackErrorTracking();
  state.player.playbackErrorSnapshot = snapshot;
  state.player.playbackErrorTimeoutId = window.setTimeout(() => {
    const currentSnapshot = state.player.playbackErrorSnapshot;
    if (!currentSnapshot || !isConfirmedPlaybackError(currentSnapshot)) {
      return;
    }

    clearPlaybackErrorTracking();
    const error = dom.videoPlayer.error;
    const errorCode = error?.code || currentSnapshot.errorCode;
    const details = describePlaybackError(errorCode);
    setVideoStatus("error", "Error");
    logEvent("error", `Error de video confirmado (${details}).`);
    clearSlowLoadPromptTracking();
    syncPlayerControls(true);
    pauseRoomForPlaybackIssue("error");
    showErrorDialog(details);
  }, PLAYBACK_ERROR_CONFIRMATION_MS);
}

function capturePlaybackErrorSnapshot() {
  const error = dom.videoPlayer.error;
  if (!error) return null;

  return {
    sourceKey: getCurrentVideoSourceKey(),
    currentSrc: dom.videoPlayer.currentSrc || dom.videoPlayer.src || "",
    errorCode: error.code,
    readyState: dom.videoPlayer.readyState,
    networkState: dom.videoPlayer.networkState,
    at: Date.now(),
  };
}

function isConfirmedPlaybackError(snapshot) {
  const error = dom.videoPlayer.error;
  if (!error) return false;
  if (snapshot.sourceKey !== getCurrentVideoSourceKey()) return false;
  if (snapshot.currentSrc !== (dom.videoPlayer.currentSrc || dom.videoPlayer.src || "")) return false;
  if (error.code !== snapshot.errorCode) return false;

  const recoveredEnough =
    dom.videoPlayer.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ||
    dom.videoPlayer.networkState === HTMLMediaElement.NETWORK_IDLE;

  if (recoveredEnough) return false;
  return true;
}

function describePlaybackError(code) {
  if (code === 1) return "La carga del video fue abortada.";
  if (code === 2) return "Error de red al intentar descargar el video.";
  if (code === 3) return "El video está corrupto o tiene un formato no soportado por tu navegador.";
  if (code === 4) return "No se pudo encontrar el video o el formato no es compatible.";
  return "No se pudo cargar el video seleccionado. Por favor, verifica el formato o que el enlace sea accesible.";
}

function clearPlaybackErrorTracking() {
  if (state.player.playbackErrorTimeoutId) {
    window.clearTimeout(state.player.playbackErrorTimeoutId);
  }
  state.player.playbackErrorTimeoutId = null;
  state.player.playbackErrorSnapshot = null;
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

function getLoadedVideoSourceKey() {
  return getVideoSourceKey(
    dom.videoPlayer.currentSrc || dom.videoPlayer.getAttribute("src") || "",
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

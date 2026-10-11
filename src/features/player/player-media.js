import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds, formatClockTime, PLAYBACK_ERROR_CONFIRMATION_MS } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { showErrorDialog, showResumeVideoDialog, showSlowLoadDialog } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { pauseRoomForPlaybackIssue } from "./player-sync-logic.js?v=20261011-chat-ui-fixes-03";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";

const VIDEO_RESUME_STORAGE_KEY = "cine-juntos-video-resume-times";
const SLOW_LOAD_DIALOG_DELAY_MS = 5 * 60 * 1000;
const MIN_RESUME_PROMPT_SECONDS = 5;
const VIDEO_FINGERPRINT_WIDTH = 32;
const VIDEO_FINGERPRINT_HEIGHT = 18;

let playerMediaSourcePort = null;

export function configurePlayerMediaSourcePort(port) {
  if (!port?.setVideoSource || !port?.setVideoStatus || !port?.syncPlayerControls) {
    throw new TypeError("El puerto de medio requiere operaciones para cargar y cambiar el estado.");
  }
  playerMediaSourcePort = port;
}

function syncPlayerControlsNow(...args) {
  playerMediaSourcePort?.syncPlayerControls(...args);
}

export function getFiniteDuration() {
  return Number.isFinite(dom.videoPlayer.duration) ? Math.max(0, dom.videoPlayer.duration) : 0;
}

export function rememberPlaybackPosition() {
  const currentTime = Number(dom.videoPlayer.currentTime);
  if (Number.isFinite(currentTime)) {
    state.player.lastKnownTime = Math.max(0, currentTime);
  }

  updateLoadButtonState();
}

export function updateLoadButtonState() {
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

export function hasLoadedMediaSource() {
  return Boolean(dom.videoPlayer.getAttribute("src"));
}

export function shouldConfirmLoadReplacement() {
  return isVideoCurrentlyPlaying() && localStorage.getItem(SKIP_LOAD_REPLACE_DIALOG_KEY) !== "1";
}

function isVideoCurrentlyPlaying() {
  return hasLoadedMediaSource() && !dom.videoPlayer.paused && !dom.videoPlayer.ended;
}

export function clearSlowLoadPromptTracking() {
  if (state.player.slowLoadPromptTimeoutId) {
    window.clearTimeout(state.player.slowLoadPromptTimeoutId);
  }
  state.player.slowLoadPromptTimeoutId = null;
  state.player.slowLoadPromptSource = "";
}

export function isVideoLoadCoolingDown() {
  return Date.now() < Number(state.player.videoLoadCooldownUntil || 0);
}

export function armSlowLoadPrompt(source) {
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
      "Vaya... el video está tardando en cargar. ¿Quieres recargarlo solo para ti?",
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
  playerMediaSourcePort.setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  syncPlayerControlsNow(true);
  logEvent("video", "Recarga local del video solicitada.");
  armSlowLoadPrompt(source);
}

export async function prepareVideoFingerprintAndPrompt() {
  const sourceKey = getCurrentVideoSourceKey();
  if (!sourceKey || state.player.resumePromptSource !== sourceKey) {
    state.player.resumePromptSource = "";
    return;
  }

  const fingerprint = await getCurrentVideoFingerprint(sourceKey);
  if (!fingerprint || getCurrentVideoSourceKey() !== sourceKey) return;

  state.player.videoFingerprint = fingerprint;
  state.player.videoFingerprintSource = sourceKey;
  const resumeTime = getStoredResumeTime(fingerprint);
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
    syncPlayerControlsNow(true);
    logEvent("video", `Reanudación local en ${formatSeconds(safeTime)}.`);
  } finally {
    window.setTimeout(() => {
      restoreSuppression();
    }, 280);
  }
}

export function schedulePlaybackErrorConfirmation() {
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
    playerRuntimeState.pendingVideoActivityAnnouncement = false;
    const error = dom.videoPlayer.error;
    const errorCode = error?.code || currentSnapshot.errorCode;
    const details = describePlaybackError(errorCode);
    playerMediaSourcePort.setVideoStatus("error", "Error");
    logEvent("error", `Error de video confirmado (${details}).`);
    clearSlowLoadPromptTracking();
    syncPlayerControlsNow(true);
    // Un error al cargar un video incompatible se informa con el diálogo; no
    // es una interrupción de reproducción que deba anunciarse en el chat.
    if (state.player.hasPlayableVideo) {
      pauseRoomForPlaybackIssue("error");
    }
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

export function clearPlaybackErrorTracking() {
  if (state.player.playbackErrorTimeoutId) {
    window.clearTimeout(state.player.playbackErrorTimeoutId);
  }
  state.player.playbackErrorTimeoutId = null;
  state.player.playbackErrorSnapshot = null;
}

export function persistPlaybackPosition(force = false) {
  const sourceKey = getCurrentVideoSourceKey();
  const fingerprint = state.player.videoFingerprintSource === sourceKey
    ? state.player.videoFingerprint
    : "";
  if (!fingerprint) return;

  const currentTime = Number(dom.videoPlayer.currentTime);
  if (!Number.isFinite(currentTime)) return;

  const safeTime = Math.max(0, currentTime);
  if (!force && safeTime < MIN_RESUME_PROMPT_SECONDS) return;
  if (!force && Date.now() - state.player.lastResumePersistAt < 5000) return;

  state.player.lastResumePersistAt = Date.now();
  setStoredResumeTime(fingerprint, safeTime);
}

function getStoredResumeTime(fingerprint) {
  const record = readResumeRecord();
  if (!record || record.fingerprint !== fingerprint) return 0;
  return Number.isFinite(Number(record.time)) ? Math.max(0, Number(record.time)) : 0;
}

function setStoredResumeTime(fingerprint, time) {
  const safeTime = Math.max(0, Number(time) || 0);
  const record = safeTime ? { fingerprint, time: safeTime } : null;

  try {
    if (record) {
      localStorage.setItem(VIDEO_RESUME_STORAGE_KEY, JSON.stringify(record));
    } else {
      localStorage.removeItem(VIDEO_RESUME_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("No se pudo guardar el tiempo de reanudación del video:", error);
  }
}

function readResumeRecord() {
  try {
    const raw = localStorage.getItem(VIDEO_RESUME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Las entradas antiguas usaban la URL como clave. Se ignoran para no
    // confundir una URL vieja con la huella real del contenido.
    return parsed && typeof parsed === "object" && parsed.fingerprint
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function getCurrentVideoFingerprint(sourceKey) {
  if (state.player.videoFingerprintSource === sourceKey && state.player.videoFingerprint) {
    return state.player.videoFingerprint;
  }

  const video = dom.videoPlayer;
  const duration = Number.isFinite(video.duration) ? Math.round(video.duration * 10) : 0;
  const metadata = `${duration}|${video.videoWidth || 0}x${video.videoHeight || 0}|`;
  let sample = "metadata";

  try {
    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_FINGERPRINT_WIDTH;
    canvas.height = VIDEO_FINGERPRINT_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 4) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619) >>> 0;
        hash ^= pixels[index + 1];
        hash = Math.imul(hash, 16777619) >>> 0;
        hash ^= pixels[index + 2];
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      sample = hash.toString(16).padStart(8, "0");
    }
  } catch {
    // Un video sin CORS puede reproducirse, pero no permite leer el canvas.
    // Los metadatos siguen dando una huella mínima sin romper la reproducción.
  }

  return `${metadata}${sample}`;
}

export function getCurrentVideoSourceKey() {
  return getVideoSourceKey(
    dom.videoPlayer.getAttribute("src") ||
    dom.videoPlayer.src ||
    dom.videoUrlInput.value.trim(),
  );
}

export function getLoadedVideoSourceKey() {
  return getVideoSourceKey(
    dom.videoPlayer.getAttribute("src") || dom.videoPlayer.src || "",
  );
}

export function getVideoSourceKey(source) {
  const normalized = String(source || "").trim();
  if (!normalized) return "";

  try {
    return new URL(normalized, window.location.href).href;
  } catch {
    return normalized;
  }
}

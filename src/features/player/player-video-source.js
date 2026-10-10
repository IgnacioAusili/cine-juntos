import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, getDisplayName, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { sendVideoEventMessage, scrollToVideoPosition } from "../chat/index.js?v=20261010-file-size-refactor-02";
import { showLoadReplaceDialog } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { clearPlaybackRecoveryTracking, publishState } from "./player-sync-logic.js?v=20261010-file-size-refactor-02";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";
import { configurePlayerMediaSourcePort, getLoadedVideoSourceKey, getVideoSourceKey, updateLoadButtonState, clearSlowLoadPromptTracking, clearPlaybackErrorTracking, armSlowLoadPrompt, hasLoadedMediaSource, isVideoLoadCoolingDown, shouldConfirmLoadReplacement } from "./player-media.js?v=20261010-file-size-refactor-02";

const SKIP_LOAD_REPLACE_DIALOG_KEY = "cine-juntos-skip-load-replace-dialog";
const VIDEO_LOAD_COOLDOWN_MS = 3000;
const VIDEO_STATUS_TOOLTIPS = Object.freeze({
  empty: "Todavía no hay un video cargado en la sala",
  loading: "El video se está cargando. Los controles se habilitarán cuando esté listo",
  loaded: "El video está cargado para todos los usuarios y listo para reproducir",
  playing: "El video se está reproduciendo de forma sincronizada para todos los usuarios",
  error: "No se pudo cargar el video. Revisá el enlace e intentá cargarlo nuevamente",
});

let syncControls = () => {};

export function configurePlayerMedia({ syncPlayerControls } = {}) {
  if (typeof syncPlayerControls === "function") {
    syncControls = syncPlayerControls;
    configurePlayerMediaSourcePort({ setVideoSource, setVideoStatus, syncPlayerControls });
  }
}

function syncPlayerControlsNow(...args) {
  syncControls(...args);
}

export function loadVideoFromUrl(source, origin) {
  if (!source) {
    setVideoStatus("empty", "Sin contenido");
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    playerRuntimeState.pendingVideoActivityAnnouncement = false;
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
    playerRuntimeState.pendingVideoActivityAnnouncement = true;
    publishState("video", { suppressActivityMessage: true });
  }
}

export async function handleManualLoadRequest() {
  if (state.player.remoteStateActive || state.player.suppressVideoEvents) return;

  const source = dom.videoUrlInput.value.trim();
  if (!source) {
    // Sin un video cargado no hay nada que reemplazar ni limpiar.
    // Evita mostrar la confirmación y deja el botón sin efecto.
    if (!hasLoadedMediaSource()) return;

    const { confirmed } = await showLoadReplaceDialog(
      "No se encontró ningún enlace para cargar. Si continuás, se quitará el video cargado actualmente para todas las personas de la sala. ¿Estás seguro?",
      { action: "remove" },
    );
    if (!confirmed) return;
    clearVideoSource(true);
    return;
  }

  if (isVideoLoadCoolingDown()) {
    return;
  }

  let shouldCenterVideoAfterLoad = false;
  if (shouldConfirmLoadReplacement()) {
    const { confirmed, skipFutureWarnings } = await showLoadReplaceDialog(
      "Se está reproduciendo un video. ¿Quieres cargar otro ahora?",
    );
    if (!confirmed) return;
    shouldCenterVideoAfterLoad = true;
    if (skipFutureWarnings) {
      localStorage.setItem(SKIP_LOAD_REPLACE_DIALOG_KEY, "1");
    }
  }

  loadVideoFromUrl(source, "manual");
  window.requestAnimationFrame(() => {
    if (shouldCenterVideoAfterLoad) {
      dom.videoArea?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      return;
    }
    scrollToVideoPosition("smooth");
  });
}

export function setVideoSource(source, shouldAnnounce, options = {}) {
  playerRuntimeState.isDurationShowingRemaining = false;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  state.player.hasPlayableVideo = false;
  state.player.videoFingerprint = "";
  state.player.videoFingerprintSource = "";
  playerRuntimeState.pendingLoadCompletionAnnouncement = Boolean(
    options.announceLoadCompletion ?? shouldAnnounce,
  );
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = options.animateSystemGroups
    ?? shouldAnnounce;
  const isReload = Boolean(options.isReload);
  state.player.lastVideoLoadWasReload = isReload;
  const nextSourceKey = getVideoSourceKey(source);
  // La sala puede devolver nuestro propio evento de carga. Si sigue siendo
  // el mismo contenido, no hay que borrar el aviso que se está preparando.
  if (shouldAnnounce) {
    state.player.resumePromptSource = nextSourceKey;
  } else if (state.player.resumePromptSource !== nextSourceKey) {
    state.player.resumePromptSource = "";
  }
  window.clearTimeout(state.player.videoLoadCooldownTimeoutId);
  state.player.videoLoadCooldownUntil = Date.now() + VIDEO_LOAD_COOLDOWN_MS;
  state.player.videoLoadCooldownTimeoutId = window.setTimeout(() => {
    state.player.videoLoadCooldownUntil = 0;
    state.player.videoLoadCooldownTimeoutId = null;
    updateLoadButtonState();
  }, VIDEO_LOAD_COOLDOWN_MS);
  updateLoadButtonState();
  clearPlaybackErrorTracking();
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  dom.videoPlayer.src = source;
  setVideoStatus("loading", isReload ? "Recargando video" : "Cargando video");
  dom.videoPlayer.load();
  dom.emptyPlayer.classList.add("hidden");
  dom.videoUrlInput.value = source;
  syncPlayerControlsNow(true);
  armSlowLoadPrompt(source);
  if (shouldAnnounce) logEvent("video", "Carga de video iniciada.");
}

export function clearVideoSource(shouldAnnounce = false) {
  playerRuntimeState.isDurationShowingRemaining = false;
  playerRuntimeState.pendingLoadCompletionAnnouncement = false;
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  state.player.hasPlayableVideo = false;
  state.player.videoFingerprint = "";
  state.player.videoFingerprintSource = "";
  state.player.resumePromptSource = "";
  clearPlaybackErrorTracking();
  clearSlowLoadPromptTracking();
  clearPlaybackRecoveryTracking();
  dom.videoPlayer.pause();
  dom.videoPlayer.removeAttribute("src");
  dom.videoPlayer.load();
  dom.videoUrlInput.value = "";
  dom.emptyPlayer.classList.remove("hidden");
  setVideoStatus("empty", "Sin contenido");
  syncPlayerControlsNow(true);
  if (shouldAnnounce && state.session.activeRoom && state.session.transport) {
    sendVideoEventMessage("video-removed", {
      from: state.session.clientId,
      name: getDisplayName(),
      time: 0,
    });
    publishState("video", { suppressActivityMessage: true });
  }
}

export function announceVideoLoadCompletion() {
  if (!playerRuntimeState.pendingLoadCompletionAnnouncement) return;
  // loadedmetadata puede llegar después de que se haya quitado la fuente
  // anterior. En ese caso no corresponde anunciar que el video terminó de
  // cargarse para los demás.
  if (!hasLoadedMediaSource()) {
    playerRuntimeState.pendingLoadCompletionAnnouncement = false;
    playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
    return;
  }
  playerRuntimeState.pendingLoadCompletionAnnouncement = false;
  const animateSystemGroups = playerRuntimeState.pendingLoadCompletionAnimateSystemGroups;
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
  if (!state.session.activeRoom || !state.session.transport) return;

  sendVideoEventMessage("video-ready", {
    from: state.session.clientId,
    name: getDisplayName(),
    isReload: Boolean(state.player.lastVideoLoadWasReload),
    time: Number(dom.videoPlayer.currentTime) || 0,
    rate: Number(dom.videoPlayer.playbackRate || 1),
    animateSystemGroups,
  });
}

export function announceVideoActivity() {
  if (!playerRuntimeState.pendingVideoActivityAnnouncement) return;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  if (!state.session.activeRoom || !state.session.transport) return;

  sendVideoEventMessage("video", {
    from: state.session.clientId,
    name: getDisplayName(),
    time: Number(dom.videoPlayer.currentTime) || 0,
    rate: Number(dom.videoPlayer.playbackRate || 1),
  });
}

export function setVideoStatus(videoState, text) {
  dom.syncStatus.className = `sync-status video-status player-status-badge ${videoState}`;
  dom.syncStatus.classList.toggle(
    "player-status-live",
    videoState === "loaded" && text === "En vivo",
  );
  dom.playerFrame?.classList.toggle("player-no-content", videoState === "empty");
  if (dom.playerLoadingOverlay) {
    dom.playerLoadingOverlay.hidden = videoState !== "loading";
    dom.playerLoadingOverlay.setAttribute(
      "aria-label",
      videoState === "loading" ? (text || "Cargando video") : "",
    );
  }
  if (videoState === "empty") {
    dom.playerFrame?.classList.remove("player-overlay-suppressed", "player-cursor-hidden");
    dom.playerFrame?.classList.add("player-overlay-visible");
  }
  const tooltipKey = videoState === "loaded" && text === "En vivo" ? "playing" : videoState;
  const tooltip = VIDEO_STATUS_TOOLTIPS[tooltipKey] || "Estado actual del video en la sala";
  dom.syncStatus.dataset.tooltip = tooltip;
  dom.syncStatus.setAttribute("aria-label", `${text}. ${tooltip}`);
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

configurePlayerMediaSourcePort({ setVideoSource, setVideoStatus, syncPlayerControls: syncControls });

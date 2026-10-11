import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { shouldToggleMuteFromVolumeButton } from "./player-volume-layout.js?v=20261010-file-size-refactor-02";
import { configurePlayerMedia, handleManualLoadRequest, setVideoStatus, announceVideoActivity, announceVideoLoadCompletion } from "./player-video-source.js?v=20261011-overlay-scroll-top-01";
import { hasLoadedMediaSource, getFiniteDuration, rememberPlaybackPosition, updateLoadButtonState, clearSlowLoadPromptTracking, schedulePlaybackErrorConfirmation, clearPlaybackErrorTracking, persistPlaybackPosition, prepareVideoFingerprintAndPrompt } from "./player-media.js?v=20261011-overlay-scroll-top-01";
import { attemptPlaybackRecovery, cancelPendingPlaybackIssueDetection, clearPlaybackRecoveryTracking, pauseRoomForPlaybackIssue, publishState } from "./player-sync-logic.js?v=20261011-overlay-scroll-top-01";
import { wireSeekTooltipEvents } from "./player-seek-tooltip-events.js?v=20261011-chat-ui-fixes-03";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";
import { wireMobilePlayerControlPlacement } from "./player.js?v=20261011-overlay-scroll-top-01";
import { handleGlobalPlayerKeydown, togglePlaybackFromControls, seekVideoBy, previewSeekPosition, commitSeekPosition, isSyncControlCoolingDown, registerSyncControlPress, syncPlayerControls, persistVolume } from "./player-control-actions.js?v=20261011-overlay-scroll-top-01";

export function wirePlayerCoreEvents() {
  configurePlayerMedia({ syncPlayerControls });
  wireMobilePlayerControlPlacement();
  document.addEventListener("keydown", handleGlobalPlayerKeydown, true);

  dom.loadVideoButton.addEventListener("click", async () => {
    await handleManualLoadRequest();
  });

  dom.playerPlayButton?.addEventListener("click", () => {
    togglePlaybackFromControls("button");
  });

  dom.playerBackButton?.addEventListener("click", () => {
    seekVideoBy(-10, "control");
  });

  dom.playerForwardButton?.addEventListener("click", () => {
    seekVideoBy(10, "control");
  });

  dom.playerSeekInput?.addEventListener("input", () => {
    previewSeekPosition();
  });

  dom.playerSeekInput?.addEventListener("change", () => {
    commitSeekPosition();
  });

  wireSeekTooltipEvents();

  dom.playerDuration?.addEventListener("click", () => {
    const duration = getFiniteDuration();
    const hasMedia = hasLoadedMediaSource();
    if (!hasMedia || duration <= 0) return;
    playerRuntimeState.isDurationShowingRemaining = !playerRuntimeState.isDurationShowingRemaining;
    syncPlayerControls();
  });

  dom.playerRateSelect?.addEventListener("change", () => {
    const nextRate = Number(dom.playerRateSelect.value);
    if (!Number.isFinite(nextRate) || nextRate <= 0) return;
    if (!hasLoadedMediaSource() || isSyncControlCoolingDown("rate")) {
      syncPlayerControls();
      return;
    }
    registerSyncControlPress("rate");
    dom.videoPlayer.playbackRate = nextRate;
    syncPlayerControls();
  });

  dom.playerMuteButton?.addEventListener("click", (event) => {
    if (!shouldToggleMuteFromVolumeButton(dom.playerVolumeGroup, event)) return;
    const isEffectivelyMuted = dom.videoPlayer.muted || dom.videoPlayer.volume === 0;
    if (isEffectivelyMuted) {
      dom.videoPlayer.volume = playerRuntimeState.lastAudibleVolume > 0 ? playerRuntimeState.lastAudibleVolume : 1;
      dom.videoPlayer.muted = false;
    } else {
      playerRuntimeState.lastAudibleVolume = dom.videoPlayer.volume;
      dom.videoPlayer.muted = true;
    }
    syncPlayerControls();
  });

  dom.playerVolumeInput?.addEventListener("input", () => {
    const vol = Number(dom.playerVolumeInput.value);
    if (Number.isFinite(vol)) {
      dom.videoPlayer.volume = vol;
      if (vol > 0) playerRuntimeState.lastAudibleVolume = vol;
      if (vol > 0 && dom.videoPlayer.muted) {
        dom.videoPlayer.muted = false;
      }
      const progress = `${vol * 100}%`;
      dom.playerVolumeInput.style.setProperty("--volume-progress", progress);
      dom.playerVolumeInput.closest(".player-volume-slider-wrap")?.style.setProperty("--volume-progress", progress);
    }
  });

  dom.playerVolumeInput?.addEventListener("change", () => {
    syncPlayerControls();
  });

  dom.playerVolumeInput?.addEventListener("pointerup", () => {
    // Quitar el foco despues de ajustar para que la barra se cierre al alejar el cursor
    dom.playerVolumeGroup?.classList.remove("is-dragging");
    dom.playerFrame?.classList.remove("player-volume-control-dragging");
    dom.playerVolumeInput.blur();
    syncPlayerControls();
    window.dispatchEvent(new Event("player-volume-drag-end"));
  });

  dom.playerVolumeInput?.addEventListener("pointerdown", () => {
    dom.playerVolumeGroup?.classList.add("is-dragging");
    dom.playerFrame?.classList.add("player-volume-control-dragging");
    window.dispatchEvent(new Event("player-volume-drag-start"));
  });
  dom.playerVolumeInput?.addEventListener("pointercancel", () => {
    dom.playerVolumeGroup?.classList.remove("is-dragging");
    dom.playerFrame?.classList.remove("player-volume-control-dragging");
    syncPlayerControls();
    window.dispatchEvent(new Event("player-volume-drag-end"));
  });

  dom.playerVolumeGroup?.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = 0.05;
    const delta = e.deltaY < 0 ? step : -step;
    const currentVol = dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume;
    const newVol = Math.min(1, Math.max(0, currentVol + delta));
    dom.videoPlayer.volume = newVol;
    if (newVol > 0) playerRuntimeState.lastAudibleVolume = newVol;
    if (newVol > 0 && dom.videoPlayer.muted) dom.videoPlayer.muted = false;
    syncPlayerControls();
  }, { passive: false });

  dom.videoPlayer.addEventListener("volumechange", () => {
    if (dom.videoPlayer.volume > 0) playerRuntimeState.lastAudibleVolume = dom.videoPlayer.volume;
    persistVolume(dom.videoPlayer.volume);
    const isVolumeInputActive = document.activeElement === dom.playerVolumeInput
      || dom.playerVolumeGroup?.classList.contains("is-dragging");
    if (!isVolumeInputActive) syncPlayerControls();
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
    setVideoStatus("loaded", "Listo");
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    state.player.lastManualPauseAt = Date.now();
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("ended", () => {
    setVideoStatus("loaded", "Listo");
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
    if (state.player.remoteSeekPending) {
      state.player.remoteSeekPending = false;
      if (state.player.remoteSeekTimeoutId) {
        window.clearTimeout(state.player.remoteSeekTimeoutId);
        state.player.remoteSeekTimeoutId = null;
      }
      return;
    }
    if (!state.player.suppressVideoEvents) publishState("seek");
  });

  dom.videoPlayer.addEventListener("ratechange", () => {
    logEvent("video", `Velocidad local ${dom.videoPlayer.playbackRate}x.`);
    syncPlayerControls();
    if (!state.player.suppressVideoEvents) publishState("rate");
  });

  dom.videoPlayer.addEventListener("loadedmetadata", () => {
    state.player.hasPlayableVideo = true;
    playerRuntimeState.isDurationShowingRemaining = false;
    dom.emptyPlayer.classList.add("hidden");
    setVideoStatus("loading", "Cargando video");
    clearPlaybackErrorTracking();
    clearSlowLoadPromptTracking();
    announceVideoActivity();
    announceVideoLoadCompletion();
    syncPlayerControls(true);
    attemptPlaybackRecovery("loadedmetadata");
  });

  dom.videoPlayer.addEventListener("loadeddata", () => {
    cancelPendingPlaybackIssueDetection();
    clearPlaybackErrorTracking();
    setVideoStatus("loaded", dom.videoPlayer.paused ? "Listo" : "En vivo");
    attemptPlaybackRecovery("loadeddata");
    void prepareVideoFingerprintAndPrompt();
  });

  dom.videoPlayer.addEventListener("canplay", () => {
    cancelPendingPlaybackIssueDetection();
    clearPlaybackErrorTracking();
    setVideoStatus("loaded", dom.videoPlayer.paused ? "Listo" : "En vivo");
    attemptPlaybackRecovery("canplay");
  });

  dom.videoPlayer.addEventListener("playing", () => {
    cancelPendingPlaybackIssueDetection();
    clearPlaybackErrorTracking();
    setVideoStatus("loaded", "En vivo");
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
    setVideoStatus("loading", "Cargando video");
    pauseRoomForPlaybackIssue("waiting");
  });

  dom.videoPlayer.addEventListener("stalled", () => {
    logEvent("video", `Video trabado localmente en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    setVideoStatus("loading", "Cargando video");
    pauseRoomForPlaybackIssue("stalled");
  });

  dom.videoPlayer.addEventListener("loadstart", () => {
    if (!dom.videoPlayer.currentSrc && !dom.videoPlayer.src) return;
    setVideoStatus("loading", "Cargando video");
  });

  dom.videoPlayer.addEventListener("error", () => {
    schedulePlaybackErrorConfirmation();
  });

  dom.videoPlayer.addEventListener("emptied", () => {
    state.player.hasPlayableVideo = false;
    playerRuntimeState.isDurationShowingRemaining = false;
    clearPlaybackErrorTracking();
    clearSlowLoadPromptTracking();
    syncPlayerControls(true);
  });

  return {
    togglePlayback: () => togglePlaybackFromControls("video"),
  };
}

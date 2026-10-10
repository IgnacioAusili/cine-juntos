import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { setInsideChatVisible } from "../chat/index.js?v=20261010-file-size-refactor-02";
import { togglePageFullscreen } from "./fullscreen.js?v=20261010-file-size-refactor-02";
import { publishState } from "./player-sync-logic.js?v=20261010-file-size-refactor-02";
import { getFiniteDuration, hasLoadedMediaSource } from "./player-media.js?v=20261010-file-size-refactor-02";
import { hideSeekTooltip, updateSeekTooltipForValue } from "./player-seek-tooltip-view.js?v=20261010-file-size-refactor-02";
import { renderPlayerControls, showPlaybackGestureIndicator, updateSeekVisuals } from "./player-control-display.js?v=20261010-file-size-refactor-02";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";

const PLAYER_VOLUME_STORAGE_KEY = "cine-juntos-player-volume";
const PLAY_BUTTON_BURST_WINDOW_MS = 1000;
const PLAY_BUTTON_BURST_LIMIT = 4;
const PLAY_BUTTON_COOLDOWN_MS = 30000;
const COOLDOWN_REFRESH_INTERVAL_MS = 250;
const SYNC_CONTROL_BURST_WINDOW_MS = PLAY_BUTTON_BURST_WINDOW_MS;
const SYNC_CONTROL_BURST_LIMIT = PLAY_BUTTON_BURST_LIMIT;
const RATE_CONTROL_BURST_LIMIT = 3;
const SYNC_CONTROL_COOLDOWN_MS = PLAY_BUTTON_COOLDOWN_MS;
const KEYBOARD_SEEK_STEP_SECONDS = 10;
const KEYBOARD_VOLUME_STEP = 0.05;
const MOBILE_PLAYER_CONTROLS_QUERY = "(max-width: 980px) and (hover: none) and (pointer: coarse)";

function isMobileCenterControlsActive() {
  return window.matchMedia(MOBILE_PLAYER_CONTROLS_QUERY).matches
    && Boolean(dom.playerCenterActions?.contains(dom.playerPlayButton));
}

export function togglePlaybackFromControls(source = "keyboard") {
  const hasMedia = hasLoadedMediaSource();
  if (!hasMedia) return;

  const now = Date.now();
  const isUserToggle = source === "button" || source === "keyboard" || source === "video";
  if (isUserToggle) {
    if (isPlayButtonCoolingDown(now)) return;
    state.player.playButtonPressTimes = (state.player.playButtonPressTimes || [])
      .filter((pressedAt) => now - pressedAt <= PLAY_BUTTON_BURST_WINDOW_MS);
    state.player.playButtonPressTimes.push(now);
  }

  const wasPlaying = !dom.videoPlayer.paused && !dom.videoPlayer.ended;
  if (isUserToggle && wasPlaying) {
    // Solo una pausa iniciada por una interacción directa del usuario puede activar el bloqueo.
    state.player.lastUserPauseAt = now;
  }

  if (dom.videoPlayer.ended) {
    dom.videoPlayer.currentTime = 0;
    dom.videoPlayer.play().catch(() => {});
    if (!isMobileCenterControlsActive()) showPlaybackGestureIndicator("pause");
  } else if (dom.videoPlayer.paused) {
    dom.videoPlayer.play().catch(() => {});
    if (!isMobileCenterControlsActive()) showPlaybackGestureIndicator("pause");
  } else {
    dom.videoPlayer.pause();
    if (!isMobileCenterControlsActive()) showPlaybackGestureIndicator("play");
  }

  if (
    isUserToggle &&
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
  }, COOLDOWN_REFRESH_INTERVAL_MS);
  syncPlayerControls();
}

function getSyncControlCooldownState(kind) {
  const prefix = kind === "rate" ? "rateControl" : "seekControl";
  return {
    pressTimesKey: `${prefix}PressTimes`,
    untilKey: `${prefix}CooldownUntil`,
    timeoutKey: `${prefix}CooldownTimeoutId`,
  };
}

export function isSyncControlCoolingDown(kind, now = Date.now()) {
  const { untilKey } = getSyncControlCooldownState(kind);
  return now < Number(state.player[untilKey] || 0);
}

function getSyncControlCooldownSeconds(kind, now = Date.now()) {
  const { untilKey } = getSyncControlCooldownState(kind);
  return Math.max(1, Math.ceil((Number(state.player[untilKey] || 0) - now) / 1000));
}

export function registerSyncControlPress(kind, now = Date.now()) {
  const { pressTimesKey } = getSyncControlCooldownState(kind);
  const pressTimes = (state.player[pressTimesKey] || [])
    .filter((pressedAt) => now - pressedAt <= SYNC_CONTROL_BURST_WINDOW_MS);
  pressTimes.push(now);
  state.player[pressTimesKey] = pressTimes;
  const burstLimit = kind === "rate" ? RATE_CONTROL_BURST_LIMIT : SYNC_CONTROL_BURST_LIMIT;
  if (pressTimes.length >= burstLimit) {
    activateSyncControlCooldown(kind, now);
  }
}

function activateSyncControlCooldown(kind, now = Date.now()) {
  const { pressTimesKey, untilKey, timeoutKey } = getSyncControlCooldownState(kind);
  state.player[untilKey] = now + SYNC_CONTROL_COOLDOWN_MS;
  state.player[pressTimesKey] = [];
  window.clearInterval(state.player[timeoutKey]);
  state.player[timeoutKey] = window.setInterval(() => {
    if (!isSyncControlCoolingDown(kind)) {
      state.player[untilKey] = 0;
      window.clearInterval(state.player[timeoutKey]);
      state.player[timeoutKey] = null;
    }
    syncPlayerControls();
  }, COOLDOWN_REFRESH_INTERVAL_MS);
  syncPlayerControls();
}

export function resetSyncControlCooldown(kind) {
  const { pressTimesKey, untilKey, timeoutKey } = getSyncControlCooldownState(kind);
  window.clearInterval(state.player[timeoutKey]);
  state.player[pressTimesKey] = [];
  state.player[untilKey] = 0;
  state.player[timeoutKey] = null;
}

export function handleGlobalPlayerKeydown(event) {
  if (event.defaultPrevented) return;
  if (event.repeat) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target?.closest?.(".mini-player-surface")) return;

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
    seekVideoBy(-KEYBOARD_SEEK_STEP_SECONDS, "keyboard");
    return;
  }

  if (key === "ArrowRight") {
    event.preventDefault();
    seekVideoBy(KEYBOARD_SEEK_STEP_SECONDS, "keyboard");
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

export function seekVideoBy(deltaSeconds, source = "control") {
  if (source === "control" || source === "keyboard") {
    if (isSyncControlCoolingDown("seek")) return;
    registerSyncControlPress("seek");
  }
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
  if (nextVolume > 0) playerRuntimeState.lastAudibleVolume = nextVolume;
  if (nextVolume > 0 && dom.videoPlayer.muted) {
    dom.videoPlayer.muted = false;
  }
  syncPlayerControls();
}

export function readPersistedVolume() {
  try {
    const storedVolume = Number(localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY));
    if (!Number.isFinite(storedVolume)) return null;
    return Math.min(1, Math.max(0, storedVolume));
  } catch {
    return null;
  }
}

export function persistVolume(volume) {
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

export function previewSeekPosition() {
  if (!dom.playerSeekInput) return;
  const nextTime = Number(dom.playerSeekInput.value);
  updateSeekVisuals(nextTime, getFiniteDuration());
  if (dom.playerCurrentTime) {
    dom.playerCurrentTime.textContent = formatSeconds(nextTime);
  }
  updateSeekTooltipForValue(nextTime);
}

export function commitSeekPosition() {
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

export function syncPlayerControls(forceSliderSync = false) {
  return renderPlayerControls(forceSliderSync, {
    isPlayButtonCoolingDown,
    isSyncControlCoolingDown,
    getSyncControlCooldownSeconds,
    isMobileCenterControlsActive,
  });
}

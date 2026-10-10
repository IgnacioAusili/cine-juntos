import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds, withShortcutHint } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { refreshTooltipForTarget, setControlIcon } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { syncMiniPlayerButton } from "./mini-player.js?v=20261010-file-size-refactor-02";
import { closeRateSelectMenu, syncRateSelectMenu, syncRateSelectWidth } from "./player-rate-menu.js?v=20261010-file-size-refactor-02";
import { hideSeekTooltip } from "./player-seek-tooltip-view.js?v=20261010-file-size-refactor-02";
import { seekTooltipState } from "./player-seek-tooltip-state.js?v=20261010-file-size-refactor-02";
import { getFiniteDuration, hasLoadedMediaSource } from "./player-media.js?v=20261010-file-size-refactor-02";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";

const MOBILE_CENTER_BUTTON_LABELS = Object.freeze({
  playerBackButton: "Retroceder 10 segundos",
  playerPlayButton: "Reproducir o pausar video",
  playerForwardButton: "Avanzar 10 segundos",
});

export function renderPlayerControls(forceSliderSync = false, controls) {
  const duration = getFiniteDuration();
  const isEnded = dom.videoPlayer.ended;
  const videoCurrentTime = isEnded && duration > 0
    ? duration
    : Number.isFinite(dom.videoPlayer.currentTime) ? Math.max(0, dom.videoPlayer.currentTime) : 0;
  const hasMedia = hasLoadedMediaSource();
  const seekInputTime = Number(dom.playerSeekInput?.value);
  // En táctil el range puede no recibir foco. Mientras el dedo lo arrastra,
  // su valor es la previsualización y no debe ser pisado por `timeupdate`.
  const currentTime = state.ui.seekDragActive && hasMedia && duration > 0 && Number.isFinite(seekInputTime)
    ? Math.max(0, Math.min(seekInputTime, duration || seekInputTime))
    : videoCurrentTime;
  const isSeekingElementFocused = document.activeElement === dom.playerSeekInput;
  const remainingTime = Math.max(0, duration - currentTime);
  const showRemainingDuration = playerRuntimeState.isDurationShowingRemaining && hasMedia && duration > 0;

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
    if (!state.ui.seekDragActive && (forceSliderSync || !isSeekingElementFocused)) {
      // Si el video terminó, forzar el value al máximo exacto para que el thumb llegue hasta el final
      const seekValue = isEnded && duration > 0 ? duration : Math.min(currentTime, duration || 0);
      dom.playerSeekInput.value = String(seekValue);
    }
    updateSeekVisuals(Number(dom.playerSeekInput.value || 0), duration, isEnded);
    if (dom.playerSeekInput.disabled) {
      state.ui.seekDragActive = false;
      dom.playerFrame?.classList.remove("player-seek-control-dragging");
      seekTooltipState.pointerId = null;
      hideSeekTooltip();
    }
  }

  if (dom.playerPlayButton) {
    const playButtonCoolingDown = controls.isPlayButtonCoolingDown();
    dom.playerPlayButton.disabled = !hasMedia;
    if (playButtonCoolingDown) dom.playerPlayButton.setAttribute("aria-disabled", "true");
    else dom.playerPlayButton.removeAttribute("aria-disabled");
    dom.playerPlayButton.classList.toggle("player-control-cooldown-disabled", playButtonCoolingDown);
    const isEnded = dom.videoPlayer.ended;
    const isPaused = dom.videoPlayer.paused && !isEnded;
    const nextIcon = isEnded ? "rotate-ccw" : isPaused ? "play" : "pause";
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
      dom.playerPlayButton.innerHTML = `<span data-lucide=\"${nextIcon}\"></span>`;
      setControlIcon(dom.playerPlayButton, nextIcon);
    }
    const icon = dom.playerPlayButton.querySelector("[data-lucide]");
    const tooltip = playButtonCoolingDown
      ? `Espera ${cooldownSeconds}s para usar el reproductor`
      : withShortcutHint(
        isEnded ? "Reiniciar video" : isPaused ? "Reproducir video" : "Pausar video",
        "Espacio",
      );
    dom.playerPlayButton.dataset.tooltip = tooltip;
    dom.playerPlayButton.setAttribute("aria-label", tooltip);
    dom.playerPlayButton.removeAttribute("title");
    refreshTooltipForTarget(dom.playerPlayButton);
    if (icon) {
      if (icon.getAttribute("data-lucide") !== nextIcon) {
        setControlIcon(dom.playerPlayButton, nextIcon);
      }
    }
  }

  const skipControlsDisabled = !hasMedia || duration <= 0;
  const skipCoolingDown = controls.isSyncControlCoolingDown("seek");
  const skipCooldownSeconds = controls.getSyncControlCooldownSeconds("seek");
  for (const control of [dom.playerBackButton, dom.playerForwardButton]) {
    if (!control) continue;
    control.disabled = skipControlsDisabled;
    if (skipCoolingDown) control.setAttribute("aria-disabled", "true");
    else control.removeAttribute("aria-disabled");
    control.classList.toggle("player-control-cooldown-disabled", skipCoolingDown);
    const direction = control === dom.playerBackButton ? "Retroceder 10 segundos" : "Avanzar 10 segundos";
    const shortcut = control === dom.playerBackButton ? "←" : "→";
    const tooltip = skipCoolingDown
      ? `Espera ${skipCooldownSeconds}s para usar este control`
      : `${direction} (${shortcut})`;
    control.dataset.tooltip = tooltip;
    control.setAttribute("aria-label", tooltip);
    control.removeAttribute("title");
    refreshTooltipForTarget(control);
  }

  if (dom.playerRateSelect) {
    const rateCoolingDown = controls.isSyncControlCoolingDown("rate");
    const rateCooldownSeconds = controls.getSyncControlCooldownSeconds("rate");
    dom.playerRateSelect.disabled = !hasMedia || rateCoolingDown;
    dom.playerRateSelect.value = String(Number(dom.videoPlayer.playbackRate || 1));
    const rateSelectWrap = dom.playerRateSelect.closest(".player-select");
    if (rateSelectWrap) {
      rateSelectWrap.dataset.disabled = dom.playerRateSelect.disabled ? "true" : "false";
      const rateTooltip = rateCoolingDown
        ? `Espera ${rateCooldownSeconds}s para cambiar la velocidad`
        : "Velocidad de reproduccion";
      rateSelectWrap.dataset.tooltip = rateTooltip;
      rateSelectWrap.setAttribute("aria-label", rateTooltip);
      syncRateSelectWidth(rateSelectWrap);
      syncRateSelectMenu(rateSelectWrap);
      if (rateCoolingDown) closeRateSelectMenu(rateSelectWrap);
    }
  }

  if (dom.playerMuteButton) {
    const icon = dom.playerMuteButton.querySelector("[data-lucide]");
    const isMuted = dom.videoPlayer.muted || dom.videoPlayer.volume === 0;
    const opensVolumeSlider = dom.playerVolumeGroup?.dataset.volumeSliderLayout === "vertical";
    const nextIcon = isMuted ? "volume-x" : dom.videoPlayer.volume < 0.5 ? "volume-1" : "volume-2";
    if (icon && icon.getAttribute("data-lucide") !== nextIcon) {
      setControlIcon(dom.playerMuteButton, nextIcon);
    }
    const tooltip = opensVolumeSlider
      ? "Ajustar volumen"
      : withShortcutHint(isMuted ? "Activar sonido" : "Silenciar", "M");
    dom.playerMuteButton.dataset.tooltip = tooltip;
    dom.playerMuteButton.setAttribute("aria-label", tooltip);
    dom.playerMuteButton.removeAttribute("title");
  }

  syncMiniPlayerButton(hasMedia);

  if (dom.playerVolumeInput) {
    const isFocused = document.activeElement === dom.playerVolumeInput;
    if (!isFocused) {
      dom.playerVolumeInput.value = String(dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume);
    }
    const currentVol = dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume;
    const progress = `${currentVol * 100}%`;
    dom.playerVolumeInput.style.setProperty("--volume-progress", progress);
    dom.playerVolumeInput.closest(".player-volume-slider-wrap")?.style.setProperty("--volume-progress", progress);
  }

  syncMobileCenterButtonTooltips(controls);
}

function syncMobileCenterButtonTooltips(controls) {
  if (!controls.isMobileCenterControlsActive()) return;

  Object.entries(MOBILE_CENTER_BUTTON_LABELS).forEach(([id, label]) => {
    const button = dom[id];
    if (!button || !dom.playerCenterActions.contains(button)) return;
    if (button.getAttribute("aria-disabled") === "true") {
      const cooldownTooltip = button.dataset.tooltip || label;
      button.dataset.tooltip = cooldownTooltip;
      button.setAttribute("aria-label", cooldownTooltip);
      return;
    }
    button.removeAttribute("data-tooltip");
    button.removeAttribute("title");
    button.setAttribute("aria-label", label);
  });
}


export function updateSeekVisuals(currentTime, duration, forceEnd = false) {
  if (!dom.playerSeekInput) return;
  const progress = forceEnd || (duration > 0 && currentTime >= duration)
    ? 100
    : duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  dom.playerSeekInput.style.setProperty("--player-progress", `${progress}%`);
  dom.playerSeekInput.closest(".player-progress-group")?.style.setProperty(
    "--player-progress",
    `${progress}%`,
  );
}

export function showPlaybackGestureIndicator(action, volumeLabel = "") {
  const indicator = dom.playbackGestureIndicator;
  if (!indicator) return;
  indicator.dataset.action = action;
  indicator.dataset.volumeLabel = volumeLabel;
  indicator.classList.remove("is-visible");
  // Reiniciar la animacion incluso cuando se pulsa varias veces seguidas.
  void indicator.offsetWidth;
  indicator.classList.add("is-visible");
  window.setTimeout(() => {
    indicator.classList.remove("is-visible");
  }, 720);
}

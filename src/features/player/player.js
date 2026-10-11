import {
  dom,
} from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { configureRateSelectMenu, initializeRateSelectMenu } from "./player-rate-menu.js?v=20261010-file-size-refactor-02";
import { hideSeekTooltip, updateSeekTooltipForValue } from "./player-seek-tooltip-view.js?v=20261011-chat-ui-fixes-03";
import { seekTooltipState } from "./player-seek-tooltip-state.js?v=20261010-file-size-refactor-02";
import { renderPlayerControls, showPlaybackGestureIndicator, updateSeekVisuals } from "./player-control-display.js?v=20261011-chat-ui-fixes-03";
import { setVideoStatus } from "./player-video-source.js?v=20261011-chat-ui-fixes-03";
import { getFiniteDuration, hasLoadedMediaSource, clearSlowLoadPromptTracking } from "./player-media.js?v=20261011-chat-ui-fixes-03";
import { playerRuntimeState } from "./player-runtime-state.js?v=20261010-file-size-refactor-02";
import { resetSyncControlCooldown, readPersistedVolume, syncPlayerControls } from "./player-control-actions.js?v=20261011-chat-ui-fixes-03";

const PLAYER_CONTROL_STYLES = new Set(["line"]);
const MOBILE_PLAYER_CONTROLS_QUERY = "(max-width: 980px) and (hover: none) and (pointer: coarse)";

export function initializePlayer() {
  playerRuntimeState.isDurationShowingRemaining = false;
  playerRuntimeState.pendingLoadCompletionAnnouncement = false;
  playerRuntimeState.pendingLoadCompletionAnimateSystemGroups = true;
  playerRuntimeState.pendingVideoActivityAnnouncement = false;
  state.ui.seekDragActive = false;
  dom.playerFrame?.classList.remove("player-seek-control-dragging");
  resetSyncControlCooldown("seek");
  resetSyncControlCooldown("rate");
  seekTooltipState.pointerId = null;
  hideSeekTooltip();
  applyPlayerControlStyle("line");
  clearSlowLoadPromptTracking();
  const persistedVolume = readPersistedVolume();
  if (persistedVolume !== null) {
    dom.videoPlayer.volume = persistedVolume;
    if (persistedVolume > 0) playerRuntimeState.lastAudibleVolume = persistedVolume;
  } else if (dom.videoPlayer.volume > 0) {
    playerRuntimeState.lastAudibleVolume = dom.videoPlayer.volume;
  }
  setVideoStatus("empty", "Sin contenido");
  configureRateSelectMenu({ hideSeekTooltip });
  initializeRateSelectMenu();
  syncPlayerControls(true);
}

export function wireMobilePlayerControlPlacement() {
  const controls = [
    dom.playerBackButton,
    dom.playerPlayButton,
    dom.playerForwardButton,
  ].filter(Boolean);
  const centerActions = dom.playerCenterActions;
  const controlsBar = dom.playerBottomActions?.querySelector(".player-controls-bar");
  if (!controls.length || !centerActions || !controlsBar) return;

  const anchors = controls.map((control) => {
    const anchor = document.createComment(`player-${control.id}-origin`);
    controlsBar.insertBefore(anchor, control);
    return { control, anchor };
  });
  const mobileQuery = window.matchMedia(MOBILE_PLAYER_CONTROLS_QUERY);
  let isMobilePlacement = null;

  const syncPlacement = () => {
    const shouldCenter = mobileQuery.matches;
    if (shouldCenter === isMobilePlacement) return;
    isMobilePlacement = shouldCenter;

    if (shouldCenter) {
      anchors.forEach(({ control }) => centerActions.append(control));
    } else {
      anchors.forEach(({ control, anchor }) => {
        anchor.parentNode?.insertBefore(control, anchor.nextSibling);
      });
    }
    syncPlayerControls();
  };

  syncPlacement();
  centerActions.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !centerActions.contains(button) || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    button.classList.remove("is-click-bouncing");
    void button.offsetWidth;
    button.classList.add("is-click-bouncing");
  });
  mobileQuery.addEventListener?.("change", syncPlacement);
  window.addEventListener("resize", syncPlacement, { passive: true });
}

function isMobileCenterControlsActive() {
  return window.matchMedia(MOBILE_PLAYER_CONTROLS_QUERY).matches
    && Boolean(dom.playerCenterActions?.contains(dom.playerPlayButton));
}

function applyPlayerControlStyle(style) {
  const nextStyle = PLAYER_CONTROL_STYLES.has(style) ? style : "line";
  dom.playerFrame?.setAttribute("data-control-style", nextStyle);
}

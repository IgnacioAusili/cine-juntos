import { dom } from "../../../core/dom.js";

export function wirePlayerOverlayVolumeEvents({ volumeState, overlayState, clearHideTimer, setOverlayVisible, scheduleHide, revealOverlay }) {
  const isVolumeControlTarget = (target) =>
    target instanceof Element && Boolean(target.closest('.player-volume-group__slider'));
  const keepVolumeControlsDuringDrag = (event) => {
    if (!isVolumeControlTarget(event.target)) return;
    volumeState.active = true;
    clearHideTimer();
    dom.playerFrame.classList.remove('player-frame--cursor-hidden');
    dom.playerFrame.classList.add('player-frame--volume-control-dragging');
    setOverlayVisible(true);
  };
  const finishVolumeControlDrag = (event) => {
    if (!volumeState.active) return;
    volumeState.active = false;
    dom.playerVolumeGroup?.classList.remove('u-dragging');
    dom.playerFrame.classList.remove('player-frame--volume-control-dragging');
    scheduleHide();
  };
  document.addEventListener("pointerdown", keepVolumeControlsDuringDrag, true);
  document.addEventListener("pointerup", finishVolumeControlDrag, true);
  document.addEventListener("pointercancel", finishVolumeControlDrag, true);
  document.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType !== "mouse"
      && event.target instanceof Element
      && event.target.closest("#playerChatToggleButton")
    ) {
      overlayState.suppressChatToggleUntil = Date.now() + 600;
      clearHideTimer();
    }
  }, true);
}

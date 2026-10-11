import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

export function wirePlayerOverlayVolumeEvents({ volumeState, overlayState, clearHideTimer, setOverlayVisible, scheduleHide, revealOverlay }) {
  const isVolumeControlTarget = (target) =>
    target instanceof Element && Boolean(target.closest(".player-volume-slider-wrap"));
  const keepVolumeControlsDuringDrag = (event) => {
    if (!isVolumeControlTarget(event.target)) return;
    volumeState.active = true;
    clearHideTimer();
    dom.playerFrame.classList.remove("player-cursor-hidden");
    dom.playerFrame.classList.add("player-volume-control-dragging");
    setOverlayVisible(true);
  };
  const finishVolumeControlDrag = (event) => {
    if (!volumeState.active) return;
    volumeState.active = false;
    dom.playerVolumeGroup?.classList.remove("is-dragging");
    dom.playerFrame.classList.remove("player-volume-control-dragging");
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

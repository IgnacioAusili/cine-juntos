import { dom } from "../../core/dom.js";
import { toggleMiniChatOverlay } from "./mini-player-chat-mirror.js?v=20261003-name-editor-curtain-cancel-esc-blur-03-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-16-bottom-chat-switch-measure-01-chat-header-anchor-04-arrow-header-slot-center-01-composer-width-01";

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;

export function wireMiniPlayerShortcuts(targetDocument, surface) {
  const handleKeydown = (event) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isEditableTarget(event.target) || isEditableTarget(targetDocument.activeElement)) return;
    if (event.key === "Tab") {
      event.preventDefault();
      toggleMiniChatOverlay(surface);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      dom.playerPlayButton.click();
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      dom.playerMuteButton.click();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      dom.videoPlayer.currentTime = Math.max(0, Math.min(
        Number.isFinite(dom.videoPlayer.duration) ? dom.videoPlayer.duration : Infinity,
        dom.videoPlayer.currentTime + direction * SEEK_STEP_SECONDS,
      ));
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      dom.videoPlayer.volume = Math.min(1, Math.max(0, dom.videoPlayer.volume + direction * VOLUME_STEP));
      if (dom.videoPlayer.volume > 0) dom.videoPlayer.muted = false;
    }
  };

  targetDocument.addEventListener("keydown", handleKeydown);
  return () => targetDocument.removeEventListener("keydown", handleKeydown);
}

function isEditableTarget(target) {
  return Boolean(target?.matches?.("input, textarea, select, [contenteditable='true']"));
}

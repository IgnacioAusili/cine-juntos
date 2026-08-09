import { dom } from "../../core/dom.js";
import { toggleMiniChatOverlay } from "./mini-player-chat-mirror.js?v=20260808-scroll-mini-player-02";

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

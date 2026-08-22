// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260819-chat-overlay-controls-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260815-seek-tooltip-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260818-fingerprint-01";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260818-fingerprint-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260818-playback-issue-threshold-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260819-chat-overlay-controls-01";

export function wirePlayerEvents() {
  wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents();
}

// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260828-mobile-volume-drag-03";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260815-seek-tooltip-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260828-mobile-volume-drag-07";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260828-mobile-volume-drag-07";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260827-entry-scroll-fix-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260828-mobile-volume-drag-03";

export function wirePlayerEvents() {
  wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents();
}

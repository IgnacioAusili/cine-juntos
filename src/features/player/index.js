// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260815-seek-tooltip-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260815-seek-tooltip-01";

export {
  initializePlayer,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260815-seek-tooltip-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260815-seek-tooltip-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js";

export function wirePlayerEvents() {
  wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents();
}

// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js";
import { wirePlayerCoreEvents } from "./player.js";

export {
  initializePlayer,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js";

export function wirePlayerEvents() {
  wirePlayerCoreEvents();
  wireFullscreenEvents();
}

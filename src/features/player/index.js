// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260812-mini-chat-fixes-09";
import { wirePlayerCoreEvents } from "./player.js?v=20260811-sync-messages-01";

export {
  initializePlayer,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260811-sync-messages-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260811-sync-messages-01";
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

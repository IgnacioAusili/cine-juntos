// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260831-mobile-landscape-tap-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260831-mobile-landscape-tap-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260831-mobile-landscape-tap-01";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20260831-player-controls-layout-04";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260831-player-volume-layout-14";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260831-mobile-landscape-tap-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260830-mobile-seek-fix-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260831-mobile-landscape-tap-01";

export function wirePlayerEvents() {
  wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents();
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

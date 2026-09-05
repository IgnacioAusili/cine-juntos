// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260904-mobile-landscape-bottom-chat-07";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260905-overlay-height-cap-04";
import { wirePlayerCoreEvents } from "./player.js?v=20260904-mobile-landscape-bottom-chat-07";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20260902-player-controls-layout-17";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260902-player-volume-layout-18";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260904-mobile-landscape-bottom-chat-07";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260904-mobile-landscape-bottom-chat-07";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260904-mobile-landscape-bottom-chat-07";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

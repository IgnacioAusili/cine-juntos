// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260928-panel-fit-chat-snap-01-volume-popup-arrow-hide-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260928-system-group-toggle-anchor-01-volume-popup-arrow-hide-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260928-panel-fit-chat-snap-01-volume-popup-arrow-hide-01";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20260902-player-controls-layout-17";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260928-volume-popup-arrow-hide-01";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260928-panel-fit-chat-snap-01-volume-popup-arrow-hide-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260928-system-group-toggle-anchor-01-volume-popup-arrow-hide-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260928-panel-fit-chat-snap-01-volume-popup-arrow-hide-01";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

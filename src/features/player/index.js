// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20261009-bottom-chat-expand-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20261009-bottom-chat-expand-01";
import { wirePlayerCoreEvents } from "./player.js?v=20261009-bottom-chat-expand-01-chat-hover-geometry-04";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20261008";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20261008";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20261009-bottom-chat-expand-01-chat-hover-geometry-04";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20261009-bottom-chat-expand-01-chat-hover-geometry-04";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20261009-bottom-chat-expand-01";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

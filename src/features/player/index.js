// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen/fullscreen.js";
import { wireMiniPlayerEvents } from "./mini-player/mini-player.js";
import { clearVideoSource, setVideoSource, waitForVideoMetadata } from "./player-video-source.js";
import { wirePlayerCoreEvents } from "./player-events.js";
import { configurePlayerMediaPort } from "./player-sync-logic.js";
import { wirePlayerControlLayouts } from "./controls/player-controls-layout.js";
import { wirePlayerVolumeLayouts } from "./controls/player-volume-layout.js";

export { initializePlayer } from "./player.js";
export {
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player-video-source.js";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen/fullscreen.js";

export function wirePlayerEvents() {
  configurePlayerMediaPort({ clearVideoSource, setVideoSource, waitForVideoMetadata });
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

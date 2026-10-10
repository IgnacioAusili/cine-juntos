// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20261010-file-size-refactor-02";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20261010-file-size-refactor-02";
import { clearVideoSource, setVideoSource, waitForVideoMetadata } from "./player-video-source.js?v=20261010-file-size-refactor-02";
import { wirePlayerCoreEvents } from "./player-events.js?v=20261010-file-size-refactor-02";
import { configurePlayerMediaPort } from "./player-sync-logic.js?v=20261010-file-size-refactor-02";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20261010-file-size-refactor-02";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20261010-file-size-refactor-02";

export { initializePlayer } from "./player.js?v=20261010-file-size-refactor-02";
export {
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player-video-source.js?v=20261010-file-size-refactor-02";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20261010-file-size-refactor-02";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20261010-file-size-refactor-02";

export function wirePlayerEvents() {
  configurePlayerMediaPort({ clearVideoSource, setVideoSource, waitForVideoMetadata });
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

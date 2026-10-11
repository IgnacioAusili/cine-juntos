// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20261011-player-skip-active-cleanup-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20261011-player-skip-active-cleanup-01";
import { clearVideoSource, setVideoSource, waitForVideoMetadata } from "./player-video-source.js?v=20261011-player-empty-state-01";
import { wirePlayerCoreEvents } from "./player-events.js?v=20261011-player-empty-state-01";
import { configurePlayerMediaPort } from "./player-sync-logic.js?v=20261011-chat-auto-switch-bem-01-video-ts-group-01";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20261011-chat-controls-repair-01";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20261011-chat-controls-repair-01";

export { initializePlayer } from "./player.js?v=20261011-player-skip-active-cleanup-01";
export {
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player-video-source.js?v=20261011-player-empty-state-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20261011-chat-auto-switch-bem-01-video-ts-group-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20261011-player-skip-active-cleanup-01";

export function wirePlayerEvents() {
  configurePlayerMediaPort({ clearVideoSource, setVideoSource, waitForVideoMetadata });
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

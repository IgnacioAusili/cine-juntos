// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260910-player-overlay-toggle-12";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260910-player-tooltip-chain-01";
import { wirePlayerCoreEvents } from "./player.js?v=20260910-player-cooldown-tooltip-05";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20260902-player-controls-layout-17";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260902-player-volume-layout-18";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260910-player-cooldown-tooltip-05";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260910-player-cooldown-tooltip-05";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260910-player-overlay-toggle-12";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

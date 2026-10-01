// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20260930-chat-accessibility-focus-01-bottom-chat-expand-02";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20260930-chat-accessibility-focus-01-pending-image-lightbox-01-preview-size-center-01-overlay-image-size-01-bottom-chat-expand-02";
import { wirePlayerCoreEvents } from "./player.js?v=20260930-chat-accessibility-focus-01-pending-image-lightbox-01-bottom-chat-expand-02";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20260929-player-controls-layout-resize-reflow-02";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260928-volume-popup-arrow-hide-01";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20260930-chat-accessibility-focus-01-pending-image-lightbox-01-bottom-chat-expand-02";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20260930-chat-accessibility-focus-01-pending-image-lightbox-01-bottom-chat-expand-02";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20260930-chat-accessibility-focus-01-bottom-chat-expand-02";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

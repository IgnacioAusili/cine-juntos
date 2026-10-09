// Coordinacion general del player: reexporta sync de video y fullscreen sin romper imports existentes.
import { wireFullscreenEvents } from "./fullscreen.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-scroll-unlocked-01";
import { wireMiniPlayerEvents } from "./mini-player.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-scroll-unlocked-01";
import { wirePlayerCoreEvents } from "./player.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";
import { wirePlayerControlLayouts } from "./player-controls-layout.js?v=20261008";
import { wirePlayerVolumeLayouts } from "./player-volume-layout.js?v=20261008";

export {
  initializePlayer,
  clearVideoSource,
  loadVideoFromUrl,
  setVideoSource,
  setVideoStatus,
  waitForVideoMetadata,
} from "./player.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";
export {
  handleRemoteState,
  publishState,
} from "./player-sync-logic.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-chat-history-page-01-scroll-unlocked-01";
export {
  handleFullscreenChange,
  snapFullscreenScroll,
  togglePageFullscreen,
} from "./fullscreen.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-scroll-unlocked-01";

export function wirePlayerEvents() {
  const playerInteractions = wirePlayerCoreEvents();
  wireMiniPlayerEvents();
  wireFullscreenEvents(playerInteractions);
  wirePlayerControlLayouts();
  wirePlayerVolumeLayouts();
}

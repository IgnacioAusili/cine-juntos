import { toggleMiniChatOverlay } from "./mini-player-chat-mirror.js?v=20260808-scroll-mini-player-02";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

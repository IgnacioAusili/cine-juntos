import { toggleMiniChatOverlay } from "./mini-player-chat-mirror.js";

export function mirrorMiniPlayerChatState(surface) {
  toggleMiniChatOverlay(surface, true);

  return {
    restore() {},
  };
}

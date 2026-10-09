import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20261009-image-reply-edge-02";
import { state } from "../../core/state.js?v=20261008";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

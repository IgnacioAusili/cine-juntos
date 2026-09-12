import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20260910-mobile-chat-button-focus-01";
import { state } from "../../core/state.js?v=20260912-name-session-01";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

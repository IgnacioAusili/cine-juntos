import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20261011-chat-controls-repair-01";
import { state } from "../../core/state.js?v=20261011-chat-controls-repair-01";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

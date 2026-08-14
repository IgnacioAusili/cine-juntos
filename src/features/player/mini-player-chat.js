import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20260813-anchored-selector-08";
import { state } from "../../core/state.js";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

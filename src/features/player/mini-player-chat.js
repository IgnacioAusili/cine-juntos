import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20261003-name-editor-curtain-cancel-esc-blur-03-system-roll-height-exact-01-system-roll-text-billboard-01-system-roll-motion-01-system-roll-wheel-depth-02";
import { state } from "../../core/state.js?v=20260914-console-log-controls-01";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20261003-name-editor-commit-stable-return-04";
import { state } from "../../core/state.js?v=20260914-console-log-controls-01";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

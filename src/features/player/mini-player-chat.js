import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20260930-chat-accessibility-focus-01-system-row-fixed-center-02-bottom-chat-expand-02-tooltip-focus-restore-skip-01";
import { state } from "../../core/state.js?v=20260914-console-log-controls-01";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add("mini-chat-state-ready");

  return {
    restore() {},
  };
}

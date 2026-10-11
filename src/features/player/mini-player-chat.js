import {
  syncMiniChatAutoExpand,
  toggleMiniChatOverlay,
} from "./mini-player-chat-mirror.js?v=20261011-bem-itcss-oocss-04";
import { state } from "../../core/state.js?v=20261011-bem-itcss-oocss-04";

export function mirrorMiniPlayerChatState(surface, visible = true) {
  toggleMiniChatOverlay(surface, visible);
  syncMiniChatAutoExpand(surface, state.chat.autoExpandInsideEnabled);
  surface.classList.add('mini-player-chat--ready');

  return {
    restore() {},
  };
}

import { dom } from "../../../core/dom.js";
import { state } from "../../../core/state.js";
import { hideTooltip } from "../../icons-tooltips.js";
import { focusChatInput } from "../composer/chat-input-focus.js";
import {
  configureReplyPreviewOperations,
  renderReplyPreview,
} from "./chat-reply-preview.js";

export { renderReplyPreview } from "./chat-reply-preview.js";
export { scrollToMessage } from "./chat-message-navigation.js";

export function setReplyTarget(message, focusInput = dom.messageInput) {
  const hadReplyTarget = Boolean(state.chat.replyTarget);
  const isSameReplyTarget = state.chat.replyTarget?.id === message.id;
  state.chat.replyTarget = {
    id: message.id,
    from: message.from || null,
    name: message.name || "Invitado",
    text: getReplyLabel(message),
  };
  state.chat.replyPreviewScope = focusInput?.closest?.(".player-chat")
    ? "overlay"
    : "external";
  renderReplyPreview({
    animate: !isSameReplyTarget,
    preserveHeight: hadReplyTarget && !isSameReplyTarget,
  });
  focusChatInput(focusInput);
  hideTooltip();
}

function getReplyLabel(message) {
  const text = String(message?.text || "").trim();
  if (text && !(text.startsWith("data:image/") && text.includes("base64,"))) return text;
  if (message?.image || (Array.isArray(message?.images) && message.images.length)) {
    return "(Imagen)";
  }
  return "";
}

export function clearReplyTarget() {
  state.chat.replyTarget = null;
  state.chat.replyPreviewScope = "both";
  renderReplyPreview();
}

configureReplyPreviewOperations({ clearReplyTarget });

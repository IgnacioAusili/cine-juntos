import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import {
  configureReplyPreviewOperations,
  renderReplyPreview,
} from "./chat-reply-preview.js?v=20261010-file-size-refactor-02";

export { renderReplyPreview } from "./chat-reply-preview.js?v=20261010-file-size-refactor-02";
export { scrollToMessage } from "./chat-message-navigation.js?v=20261010-file-size-refactor-02";

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

// Menu contextual del mensaje: posicion, ocultado y copiado de texto.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";

export function showMessageMenu(message, x, y, replyInput = null) {
  clearMessageMenuSourceState();
  state.chat.menuMessage = message;
  state.chat.menuReplyInput = replyInput;
  state.chat.messageMenuOpenedAt = Date.now();
  dom.messageMenu.hidden = false;
  const rect = dom.messageMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  dom.messageMenu.style.left = `${left}px`;
  dom.messageMenu.style.top = `${top}px`;
  markMessageMenuSource(message, replyInput);
}

export function hideMessageMenu() {
  clearMessageMenuSourceState();
  state.chat.menuMessage = null;
  state.chat.menuReplyInput = null;
  dom.messageMenu.hidden = true;
}

function markMessageMenuSource(message, replyInput) {
  const container = replyInput === dom.overlayMessageInput ? dom.overlayMessages : dom.messages;
  const item = Array.from(container?.children || []).find(
    (candidate) => candidate._chatMessage === message || candidate.dataset.messageId === message?.id,
  );
  item?.classList.add("message-menu-open");
}

function clearMessageMenuSourceState() {
  document.querySelectorAll(".message-menu-open").forEach((item) => {
    item.classList.remove("message-menu-open");
  });
}

export function copyMessageText(message) {
  navigator.clipboard?.writeText(message.text || "").catch(() => {});
  logEvent("chat", "Mensaje copiado.");
}

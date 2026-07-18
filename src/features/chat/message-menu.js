// Menu contextual del mensaje: posicion, ocultado y copiado de texto.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";

export function showMessageMenu(message, x, y) {
  state.chat.menuMessage = message;
  state.chat.messageMenuOpenedAt = Date.now();
  dom.messageMenu.hidden = false;
  const rect = dom.messageMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  dom.messageMenu.style.left = `${left}px`;
  dom.messageMenu.style.top = `${top}px`;
}

export function hideMessageMenu() {
  state.chat.menuMessage = null;
  dom.messageMenu.hidden = true;
}

export function copyMessageText(message) {
  navigator.clipboard?.writeText(message.text || "").catch(() => {});
  logEvent("chat", "Mensaje copiado.");
}

import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js";
import { formatClockTime } from "../../core/utils.js";
import { renderMessage } from "./chat-render.js";

/**
 * Genera y envía un mensaje de sistema al chat describiendo un evento de video.
 * @param {string} action - El tipo de evento ('play', 'pause', 'seek', 'rate', 'video', 'hold').
 * @param {Object} currentState - El estado actual del reproductor.
 */
export function sendVideoEventMessage(action, currentState) {
  const text = describeVideoEvent(action, currentState);
  if (!text) return;

  const message = {
    id: crypto.randomUUID(),
    from: state.session.clientId,
    name: getDisplayName(),
    text,
    system: true,
    createdAt: getTransportNow(),
  };

  state.session.transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent(
      "error",
      `No se pudo enviar evento al chat: ${error.message || error}`,
    );
  });

  // En modo local, el transporte no hace eco de los mensajes, así que lo renderizamos manualmente.
  if (state.session.transport.mode === "local") renderMessage(message);
}

/**
 * Traduce un evento de video a una cadena de texto amigable para el chat.
 */
function describeVideoEvent(action, currentState) {
  const name = currentState.name || getDisplayName();
  const time = formatClockTime(currentState.time);
  if (action === "play") return `${name} reprodujo el video en ${time}`;
  if (action === "pause") return `${name} pauso el video en ${time}`;
  if (action === "seek") return `${name} salto a ${time}`;
  if (action === "rate")
    return `${name} cambio la velocidad a ${currentState.rate}x`;
  if (action === "video") return `${name} cargo un video nuevo`;
  if (action === "hold") return `${name} se ${describePlaybackIssue(currentState.issueReason)} en ${time}`;
  return "";
}

function describePlaybackIssue(reason) {
  if (reason === "waiting") return "tiene cargando el video";
  if (reason === "stalled") return "tiene trabado el video";
  if (reason === "error") return "tiene con error el video";
  return "tiene con problemas el video";
}

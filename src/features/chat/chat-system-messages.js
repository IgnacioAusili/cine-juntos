import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../../core/state.js";
import { formatClockTime } from "../../core/utils.js";
import { renderMessage } from "./chat-render.js?v=20260825-history-system-no-entry-animation-04";

/**
 * Genera y envía un mensaje de sistema al chat describiendo un evento de video.
 * @param {string} action - El tipo de evento ('play', 'pause', 'seek', 'rate', 'video', 'video-ready', 'video-removed', 'hold').
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
  if (action === "video-ready") {
    message.videoEvent = {
      action,
      isReload: Boolean(currentState.isReload),
    };
  }
  if (typeof currentState.animateSystemGroups === "boolean") {
    message.animateSystemGroups = currentState.animateSystemGroups;
  }

  state.session.transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent(
      "error",
      `No se pudo enviar evento al chat: ${error.message || error}`,
    );
  });

  // En modo local, el transporte no hace eco de los mensajes, así que lo
  // renderizamos manualmente. En Firebase lo renderiza el eco de onChildAdded
  // para evitar que el aviso aparezca dos veces.
  if (state.session.transport.mode === "local") renderMessage(message);
}

/**
 * Traduce un evento de video a una cadena de texto amigable para el chat.
 */
function describeVideoEvent(action, currentState) {
  const name = currentState.name || getDisplayName();
  const time = formatClockTime(currentState.time);
  if (action === "play") {
    if (currentState.time === 0 || time === "0:00") {
      return `${name} inició el video`;
    }
    return `${name} reprodujo el video en ${time}`;
  }
  if (action === "pause") return `${name} pausó el video en ${time}`;
  if (action === "seek") return `${name} saltó a ${time}`;
  if (action === "rate")
    return `${name} cambió la velocidad a ${currentState.rate}x`;
  if (action === "video") {
    return `${name} ingresó un video`;
  }
  if (action === "video-removed") {
    return currentState.from === state.session.clientId
      ? "Quitaste el video"
      : `${name} ha quitado el video`;
  }
  if (action === "video-ready") {
    return currentState.isReload
      ? `${name} le ha recargado el video`
      : `${name} le ha cargado el video`;
  }
  if (action === "hold") return `${name} ${describePlaybackIssue(currentState.issueReason)} en ${time}`;
  return "";
}

function describePlaybackIssue(reason) {
  return "tiene inconvenientes en el video";
}

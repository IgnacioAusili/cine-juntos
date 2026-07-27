import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { MAX_RENDERED_MESSAGES, formatTime, formatClockTime } from "../../core/utils.js";
import { rememberParticipant } from "../presence.js";
import { wireMessageInteractions } from "./chat-message-interactions.js";
import { appendMessageContent, truncateText } from "./chat-content-parser.js";
import { getParticipantAccent } from "./chat-participant-color.js";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js";
import {
  handleIncomingUnread,
  incrementScrollIndicator,
} from "./unread-counters.js";
import { setReplyTarget, scrollToMessage } from "./chat-reply.js";

/**
 * Renderiza un mensaje en los contenedores de chat.
 */
export function renderMessage(message) {
  const messageImages = Array.isArray(message?.images) ? message.images : [];
  if (
    (!message?.text && !message?.image && !messageImages.length) ||
    state.chat.lastMessageIds.has(message.id)
  )
    return;
  state.chat.lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);

  appendMessageTo(dom.messages, message);
  appendMessageTo(dom.overlayMessages, message);

  if (message.from !== state.session.clientId) {
    handleIncomingUnread();
  }
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
}

/**
 * Crea y añade el elemento DOM del mensaje al contenedor.
 */
function appendMessageTo(container, message) {
  const item = document.createElement("article");
  item.className = `message${message.from === state.session.clientId ? " mine" : ""}${message.system ? " system" : ""}`;
  item.dataset.messageId = message.id;
  item.style.setProperty("--participant-accent", getParticipantAccent(message.from || message.name));

  const meta = document.createElement("div");
  meta.className = "message-meta";

  if (message.videoTimestamp != null && !message.system) {
    const tsBtn = document.createElement("button");
    tsBtn.type = "button";
    tsBtn.className = "message-video-ts";
    tsBtn.title = `Ir al minuto ${formatClockTime(message.videoTimestamp)} del video`;
    tsBtn.setAttribute("aria-label", `Saltar a ${formatClockTime(message.videoTimestamp)} en el video`);
    tsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="8" height="8" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg><span>${formatClockTime(message.videoTimestamp)}</span>`;
    tsBtn.addEventListener("click", () => {
      if (dom.videoPlayer && Number.isFinite(message.videoTimestamp)) {
        dom.videoPlayer.currentTime = message.videoTimestamp;
      }
    });
    meta.append(tsBtn);
  }

  const metaName = document.createElement("span");
  metaName.className = "message-meta-name";
  metaName.textContent = message.name || "Invitado";
  meta.append(metaName);

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = formatTime(message.createdAt);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const content = document.createElement("div");
  content.className = "message-content";
  bubble.append(content);
  if (message.replyTo?.text) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "message-reply";
    reply.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(message.replyTo.from || message.replyTo.id || message.replyTo.name),
    );
    reply.innerHTML = `<span class="message-reply-name">${message.replyTo.name || "Invitado"}</span><span class="message-reply-body">${truncateText(message.replyTo.text, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id));
    content.append(reply);
  }

  if (message.text) {
    if (message.system) {
      let displayText = message.text;
      if (message.from === state.session.clientId) {
        // Obtenemos el nombre exacto con el que se envió
        const nameKey = message.name || "Invitado";
        if (displayText.startsWith(nameKey)) {
          // Quitar el nombre propio y conjugar el mensaje en segunda persona.
          let sub = displayText.substring(nameKey.length).trim();

          // Mapeo de verbos en tercera persona a segunda persona.
          const verbReplacements = [
            { from: /^inició el video/, to: "iniciaste el video" },
            { from: /^reprodujo el video en/, to: "reprodujiste el video en" },
            { from: /^pausó el video en/, to: "pausaste el video en" },
            { from: /^saltó a/, to: "saltaste a" },
            { from: /^cambió la velocidad a/, to: "cambiaste la velocidad a" },
            { from: /^cargó un video nuevo/, to: "cargaste un video nuevo" },
            { from: /^qued(?:ó|aste) en espera(?:\s*\(.*?\))?/, to: "tienes inconvenientes en el video" },
            { from: /^tiene problemas de buffer/, to: "tienes inconvenientes en el video" },
            { from: /^tiene problemas de conexión/, to: "tienes inconvenientes en el video" },
            { from: /^tiene problemas de carga/, to: "tienes inconvenientes en el video" },
            { from: /^tiene inconvenientes en el video/, to: "tienes inconvenientes en el video" },
            { from: /^está cargando el video/, to: "tienes inconvenientes en el video" },
            { from: /^tiene el video pausado/, to: "tienes inconvenientes en el video" },
            { from: /^tiene el video trabado/, to: "tienes inconvenientes en el video" },
            { from: /^tuvo un error/, to: "tienes inconvenientes en el video" },
            { from: /^tiene un error en el video/, to: "tienes inconvenientes en el video" },
            { from: /^tiene un problema con el video/, to: "tienes inconvenientes en el video" },
            { from: /^tiene inconvenientes/, to: "tienes inconvenientes en el video" }
          ];

          for (const rep of verbReplacements) {
            if (rep.from.test(sub)) {
              sub = sub.replace(rep.from, rep.to);
              break;
            }
          }
          displayText = sub;
        }
      }
      bubble.classList.add("message-system-bubble");
      const systemText = document.createElement("span");
      systemText.className = "message-system-text";
      systemText.textContent = capitalizeMessage(displayText);
      content.append(systemText);
    } else {
      appendMessageContent(content, message.text);
    }
  }

  appendMessageMedia(content, message);

  if (message.system) {
    item.append(meta, bubble);
  } else {
    const bubbleRow = document.createElement("div");
    bubbleRow.className = "message-bubble-row";

    const hintWrapper = document.createElement("div");
    hintWrapper.className = "swipe-reply-hint-wrapper";
    const hint = document.createElement("span");
    hint.className = "swipe-reply-hint";
    hint.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);

    bubbleRow.append(bubble, hintWrapper);
    item.append(meta, bubbleRow);

    wireMessageInteractions(bubble, message, hint, { setReplyTarget });
    bubble.append(time);
  }
  container.append(item);
  scheduleMessageTimeAdjustment();
  trimRenderedMessages(container);

  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (
    distanceFromBottom <= threshold ||
    message.from === state.session.clientId
  ) {
    container.scrollTop = container.scrollHeight;
  } else if (message.from !== state.session.clientId) {
    incrementScrollIndicator(isOverlay);
  }
}

/**
 * Limita la cantidad de mensajes renderizados para optimizar el rendimiento.
 */
function trimRenderedMessages(container) {
  while (container.children.length > MAX_RENDERED_MESSAGES) {
    container.firstElementChild?.remove();
  }
}

function capitalizeMessage(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toLocaleUpperCase("es-ES") + value.slice(1);
}

function appendMessageMedia(container, message) {
  const images = Array.isArray(message.images)
    ? message.images.filter(Boolean)
    : message.image
      ? [message.image]
      : [];

  if (!images.length) return;

  const strip = document.createElement("div");
  strip.className = "message-media-strip";

  for (const imageUrl of images.slice(0, 2)) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = imageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";

    const imgElement = document.createElement("img");
    imgElement.className = "message-media";
    imgElement.src = imageUrl;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    strip.append(link);
  }

  container.append(strip);
}

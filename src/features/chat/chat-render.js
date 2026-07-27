import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { MAX_RENDERED_MESSAGES, formatTime, formatClockTime } from "../../core/utils.js";
import { rememberParticipant } from "../presence.js";
import { wireMessageInteractions } from "./chat-message-interactions.js";
import { truncateText } from "./chat-content-parser.js";
import { getParticipantAccent } from "./chat-participant-color.js";
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
      renderMessageTextFlow(
        content,
        message.text,
        container === dom.overlayMessages,
        time,
        Boolean(message.replyTo?.text),
      );
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

    if (time.textContent) {
      if (!attachTimeToTextFlow(content, time)) {
        time.classList.add("message-time--standalone");
        content.append(time);
      }
    }
  }
  container.append(item);
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

function renderMessageTextFlow(container, text, isOverlay, time, hasReply = false) {
  const value = String(text || "").trim();
  if (!value) return;

  const plainLines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const gap = 4;
  const availableWidth = getTextFlowAvailableWidth(isOverlay);
  const measurer = createTextMeasurer(isOverlay);
  const timePreviewWidth = measurer.measureText(time?.textContent || "00:00");
  const lineWidthLimit = Math.max(80, availableWidth);
  const tailWidthLimit = Math.max(80, availableWidth - timePreviewWidth - gap);

  const flow = document.createElement("div");
  flow.className = "message-flow";
  const lines = [];

  for (const paragraph of plainLines) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const paragraphLines = wrapWordsIntoLines(words, lineWidthLimit, measurer);
    lines.push(...paragraphLines);
  }

  if (!lines.length) {
    const fallback = document.createElement("div");
    fallback.className = "message-flow-line";
    fallback.textContent = value;
    flow.append(fallback);
    container.append(flow);
    return;
  }

  balanceLastLine(lines, tailWidthLimit, lineWidthLimit, measurer);

  for (let i = 0; i < lines.length; i += 1) {
    const lineEl = document.createElement("div");
    lineEl.className = "message-flow-line";
    if (i === lines.length - 1) {
      lineEl.classList.add("message-flow-line--tail");
      if (hasReply) lineEl.classList.add("message-flow-line--tail-reply");
      const textSpan = document.createElement("span");
      textSpan.className = "message-flow-text";
      appendLineWords(textSpan, lines[i].words);
      lineEl.append(textSpan);
    } else {
      appendLineWords(lineEl, lines[i].words);
    }
    flow.append(lineEl);
  }

  container.append(flow);
}

function attachTimeToTextFlow(container, time) {
  const flow = container.querySelector(".message-flow");
  if (!flow) return false;
  const tailLine = flow.querySelector(".message-flow-line--tail") || flow.lastElementChild;
  if (!tailLine) return false;

  time.classList.add("message-time--inline");
  tailLine.append(time);

  const bubble = container.closest(".message-bubble");
  if (!bubble) return;
  if (flow.children.length === 1) {
    bubble.style.minWidth = `${Math.ceil(tailLine.scrollWidth || tailLine.getBoundingClientRect().width || 0)}px`;
  } else {
    bubble.style.minWidth = "";
  }

  return true;
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

function getTextFlowAvailableWidth(isOverlay) {
  const root = isOverlay ? dom.overlayMessages : dom.messages;
  if (!root) return 360;
  const width = root.getBoundingClientRect().width || root.clientWidth || 360;
  const limit = isOverlay ? 0.82 : 1;
  return Math.max(120, Math.floor(width * limit) - 18);
}

function createTextMeasurer(isOverlay) {
  const host = getMeasureHost(isOverlay);
  const probe = document.createElement("span");
  probe.className = "message-bubble message-flow message-flow-measure";
  probe.textContent = "M";
  host.append(probe);
  const styles = window.getComputedStyle(probe);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = [
    styles.fontStyle,
    styles.fontVariant,
    styles.fontWeight,
    styles.fontSize,
    styles.fontFamily,
  ]
    .filter(Boolean)
    .join(" ");
  ctx.font = font || `${styles.fontWeight || "400"} ${styles.fontSize || "14px"} ${styles.fontFamily || "sans-serif"}`;
  const letterSpacing = Number.parseFloat(styles.letterSpacing) || 0;
  const spaceWidth = ctx.measureText(" ").width + letterSpacing;
  probe.remove();
  return {
    measureText(value) {
      const text = String(value || "");
      if (!text) return 0;
      return ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
    },
    spaceWidth,
  };
}

function getMeasureHost(isOverlay) {
  const id = isOverlay ? "message-measure-host-overlay" : "message-measure-host-main";
  let host = document.getElementById(id);
  if (host) return host;
  host = document.createElement("div");
  host.id = id;
  host.className = isOverlay ? "overlay-messages" : "messages";
  host.style.position = "absolute";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "800px";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  document.body.append(host);
  return host;
}

function wrapWordsIntoLines(words, maxWidth, measurer) {
  const lines = [];
  let current = [];
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = measurer.measureText(word);
    const extra = current.length ? measurer.spaceWidth : 0;
    if (current.length && currentWidth + extra + wordWidth > maxWidth) {
      lines.push({ words: current, width: currentWidth });
      current = [word];
      currentWidth = wordWidth;
      continue;
    }
    if (!current.length) {
      current = [word];
      currentWidth = wordWidth;
      continue;
    }
    current.push(word);
    currentWidth += extra + wordWidth;
  }

  if (current.length) lines.push({ words: current, width: currentWidth });
  return lines;
}

function balanceLastLine(lines, tailWidthLimit, lineWidthLimit, measurer) {
  if (lines.length <= 1) return;

  const lineWidth = (line) =>
    line.words.reduce((width, word, index) => {
      const wordWidth = measurer.measureText(word);
      return width + wordWidth + (index > 0 ? measurer.spaceWidth : 0);
    }, 0);

  let tail = lines[lines.length - 1];
  let tailWidth = lineWidth(tail);

  while (tailWidth > tailWidthLimit && lines.length > 1 && tail.words.length > 1) {
    const moved = tail.words.shift();
    const prev = lines[lines.length - 2];
    prev.words.push(moved);

    while (prev.words.length > 1 && lineWidth(prev) > lineWidthLimit) {
      const overflowWord = prev.words.shift();
      const beforePrev = lines[lines.length - 3];
      if (!beforePrev) {
        prev.words.unshift(overflowWord);
        break;
      }
      beforePrev.words.push(overflowWord);
      if (lineWidth(beforePrev) <= lineWidthLimit) break;
    }

    tailWidth = lineWidth(tail);
  }
}

function appendLineWords(lineEl, words) {
  if (!words.length) return;
  const urlPattern = /^(https?:\/\/[^\s<>"']+)$/i;
  words.forEach((word, index) => {
    const needsSpace = index > 0;
    if (needsSpace) lineEl.append(" ");
    if (urlPattern.test(word)) {
      const link = document.createElement("a");
      link.className = "message-link";
      link.href = word;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = word;
      lineEl.append(link);
      return;
    }
    lineEl.append(document.createTextNode(word));
  });
}

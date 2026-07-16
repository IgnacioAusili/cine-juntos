import {
  dom,
} from "../core/dom.js";
import {
  state,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../core/state.js";
import {
  MAX_RENDERED_MESSAGES,
  formatTime,
  formatClockTime,
} from "../core/utils.js";
import {
  rememberParticipant,
} from "./presence.js";
import { wireMessageInteractions } from "./chat-message-interactions.js";
import { appendMessageContent, truncateText } from "./chat-message-content.js";
import {
  incrementInsideUnread,
  resetInsideUnread,
  incrementExternalUnread,
  resetExternalUnread,
  incrementScrollIndicator,
} from "./unread-counters.js";

export function renderMessage(message) {
  if ((!message?.text && !message?.image) || state.chat.lastMessageIds.has(message.id)) return;
  state.chat.lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);

  appendMessageTo(dom.messages, message);
  appendMessageTo(dom.overlayMessages, message);

  const insideChatOpen = dom.playerFrame.classList.contains("chat-inside-open");
  const externalChatOpen = !dom.sessionView.classList.contains("chat-collapsed");

  if (message.from !== state.session.clientId && !insideChatOpen) {
    incrementInsideUnread();
  }
  if (message.from !== state.session.clientId && !externalChatOpen) {
    incrementExternalUnread();
  }
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
}

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
    logEvent("error", `No se pudo enviar evento al chat: ${error.message || error}`);
  });

  if (state.session.transport.mode === "local") renderMessage(message);
}

function describeVideoEvent(action, currentState) {
  const name = currentState.name || getDisplayName();
  const time = formatClockTime(currentState.time);
  if (action === "play") return `${name} reprodujo el video en ${time}.`;
  if (action === "pause") return `${name} pauso el video en ${time}.`;
  if (action === "seek") return `${name} salto a ${time}.`;
  if (action === "rate") return `${name} cambio la velocidad a ${currentState.rate}x.`;
  if (action === "video") return `${name} cargo un video nuevo.`;
  return "";
}

function appendMessageTo(container, message) {
  const item = document.createElement("article");
  item.className = `message${message.from === state.session.clientId ? " mine" : ""}${message.system ? " system" : ""}`;
  item.dataset.messageId = message.id;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${message.name || "Invitado"} · ${formatTime(message.createdAt)}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  if (message.replyTo?.text) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "message-reply";
    reply.innerHTML = `<span class="message-reply-name">${message.replyTo.name || "Invitado"}</span><span class="message-reply-body">${truncateText(message.replyTo.text, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id));
    bubble.append(reply);
  }

  if (message.text) {
    appendMessageContent(bubble, message.text);
  }

  if (message.image) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = message.image;
    link.target = "_blank";

    const imgElement = document.createElement("img");
    imgElement.className = "message-media";
    imgElement.src = message.image;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    bubble.append(link);
  }

  if (message.system) {
    item.append(meta, bubble);
  } else {
    const bubbleRow = document.createElement("div");
    bubbleRow.className = "message-bubble-row";

    const hintWrapper = document.createElement("div");
    hintWrapper.className = "swipe-reply-hint-wrapper";
    const hint = document.createElement("span");
    hint.className = "swipe-reply-hint";
    hint.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";
    hintWrapper.append(hint);

    bubbleRow.append(bubble, hintWrapper);
    item.append(meta, bubbleRow);

    wireMessageInteractions(bubble, message, hint, { setReplyTarget });
  }
  container.append(item);
  trimRenderedMessages(container);

  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromBottom <= threshold || message.from === state.session.clientId) {
    container.scrollTop = container.scrollHeight;
  } else if (message.from !== state.session.clientId) {
    incrementScrollIndicator(isOverlay);
  }
}

function trimRenderedMessages(container) {
  while (container.children.length > MAX_RENDERED_MESSAGES) {
    container.firstElementChild?.remove();
  }
}

export function setReplyTarget(message) {
  state.chat.replyTarget = {
    id: message.id,
    name: message.name || "Invitado",
    text: message.text || "",
  };
  renderReplyPreview();
  dom.messageInput.focus();
}

export function clearReplyTarget() {
  state.chat.replyTarget = null;
  renderReplyPreview();
}

export function renderReplyPreview() {
  [dom.replyPreview, dom.overlayReplyPreview].forEach((container) => {
    if (!container) return;
    container.innerHTML = "";
    if (!state.chat.replyTarget) {
      container.classList.remove("reply-preview--visible");
      window.setTimeout(() => {
        if (!state.chat.replyTarget) container.hidden = true;
      }, 200);
      return;
    }

    const replyIcon = document.createElement("span");
    replyIcon.className = "reply-preview-icon";
    replyIcon.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";

    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "reply-preview-text";
    textBtn.innerHTML = `<span class="reply-preview-name">${state.chat.replyTarget.name}</span><span class="reply-preview-body">${truncateText(state.chat.replyTarget.text || "", 60)}</span>`;
    textBtn.addEventListener("click", () => scrollToMessage(state.chat.replyTarget.id));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "reply-preview-close";
    close.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>";
    close.setAttribute("aria-label", "Cancelar respuesta");
    close.addEventListener("click", clearReplyTarget);

    container.append(replyIcon, textBtn, close);
    container.hidden = false;
    container.getBoundingClientRect();
    container.classList.add("reply-preview--visible");
  });
}

export function scrollToMessage(messageId) {
  if (!messageId) return;
  const containers = [dom.messages, dom.overlayMessages];
  for (const container of containers) {
    const target = container.querySelector(`article[data-message-id="${messageId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightMessage(target);
      return;
    }
  }
}

function highlightMessage(element) {
  element.classList.remove("message-highlight");
  void element.offsetWidth;
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
  }, 2600);
}

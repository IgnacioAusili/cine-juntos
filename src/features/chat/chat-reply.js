import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { truncateText } from "./chat-content-parser.js";
import { getParticipantAccent } from "./chat-participant-color.js";
import { isPinnedToBottom, queuePinnedChatScrollSync } from "./chat-scroll-sync.js";

let pendingReplyLayoutSync = null;
let pendingReplyPreviewHide = null;

/**
 * Establece el mensaje al que se está respondiendo y actualiza la vista previa.
 * @param {Object} message - El objeto del mensaje original.
 */
export function setReplyTarget(message) {
  const wasPinnedMain = isPinnedToBottom(dom.messages);
  const wasPinnedOverlay = isPinnedToBottom(dom.overlayMessages);

  state.chat.replyTarget = {
    id: message.id,
    from: message.from || null,
    name: message.name || "Invitado",
    text: message.text || "",
  };
  renderReplyPreview();
  dom.messageInput.focus();
  queuePinnedChatScrollSync(dom.messages, false, wasPinnedMain);
  queuePinnedChatScrollSync(dom.overlayMessages, true, wasPinnedOverlay);
  scheduleReplyLayoutSync(wasPinnedMain, wasPinnedOverlay);
}

/**
 * Limpia el objetivo de respuesta y oculta la vista previa.
 */
export function clearReplyTarget() {
  const wasPinnedMain = isPinnedToBottom(dom.messages);
  const wasPinnedOverlay = isPinnedToBottom(dom.overlayMessages);

  state.chat.replyTarget = null;
  renderReplyPreview();
  queuePinnedChatScrollSync(dom.messages, false, wasPinnedMain);
  queuePinnedChatScrollSync(dom.overlayMessages, true, wasPinnedOverlay);
  scheduleReplyLayoutSync(wasPinnedMain, wasPinnedOverlay);
}

/**
 * Renderiza la vista previa de la respuesta en los inputs (normal y overlay).
 */
export function renderReplyPreview() {
  const getExpandedReplyHeight = (container) => Math.max(container.scrollHeight + 12, 42);

  [dom.replyPreview, dom.overlayReplyPreview].forEach((container) => {
    if (!container) return;
    if (pendingReplyPreviewHide) {
      window.clearTimeout(pendingReplyPreviewHide);
      pendingReplyPreviewHide = null;
    }
    if (!state.chat.replyTarget) {
      container.style.removeProperty("--reply-participant-accent");
      container.style.setProperty("--reply-preview-max-height", `${container.offsetHeight}px`);
      container.getBoundingClientRect(); // Force reflow before collapsing.
      container.classList.remove("reply-preview--visible");
      pendingReplyPreviewHide = window.setTimeout(() => {
        if (!state.chat.replyTarget) {
          container.hidden = true;
          container.innerHTML = "";
          container.style.removeProperty("--reply-preview-max-height");
        }
        pendingReplyPreviewHide = null;
      }, 240);
      return;
    }

    container.innerHTML = "";
    container.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(state.chat.replyTarget.from || state.chat.replyTarget.id || state.chat.replyTarget.name),
    );
    const replyIcon = document.createElement("span");
    replyIcon.className = "reply-preview-icon";
    replyIcon.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>";

    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "reply-preview-text";
    textBtn.innerHTML = `<span class="reply-preview-name">${state.chat.replyTarget.name}</span><span class="reply-preview-body">${truncateText(state.chat.replyTarget.text || "", 58)}</span>`;
    textBtn.addEventListener("click", () =>
      scrollToMessage(state.chat.replyTarget.id),
    );

    const close = document.createElement("button");
    close.type = "button";
    close.className = "reply-preview-close";
    close.innerHTML =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>";
    close.setAttribute("aria-label", "Cancelar respuesta");
    close.addEventListener("click", clearReplyTarget);

    container.append(replyIcon, textBtn, close);
    container.hidden = false;
    container.style.setProperty("--reply-preview-max-height", "0px");
    container.getBoundingClientRect(); // Force reflow
    container.style.setProperty("--reply-preview-max-height", `${getExpandedReplyHeight(container)}px`);
    container.classList.add("reply-preview--visible");
  });
}

/**
 * Desplaza la vista hasta un mensaje específico y lo resalta.
 * @param {string} messageId - El ID del mensaje al que desplazarse.
 */
export function scrollToMessage(messageId) {
  if (!messageId) return;
  const containers = [dom.messages, dom.overlayMessages];
  for (const container of containers) {
    const target = container.querySelector(
      `article[data-message-id="${messageId}"]`,
    );
    if (target) {
      const targetTop = target.offsetTop;
      const targetBottom = targetTop + target.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const fullyVisible = targetTop >= viewTop && targetBottom <= viewBottom;

      if (!fullyVisible) {
        const nextTop = Math.max(0, targetTop - container.clientHeight / 2 + target.offsetHeight / 2);
        container.scrollTo({ top: nextTop, behavior: "smooth" });
      }

      highlightMessage(target);
      return;
    }
  }
}

function scheduleReplyLayoutSync(wasPinnedMain, wasPinnedOverlay) {
  if (pendingReplyLayoutSync) {
    window.clearTimeout(pendingReplyLayoutSync);
  }

  pendingReplyLayoutSync = window.setTimeout(() => {
    pendingReplyLayoutSync = null;
    queuePinnedChatScrollSync(dom.messages, false, wasPinnedMain);
    queuePinnedChatScrollSync(dom.overlayMessages, true, wasPinnedOverlay);
  }, 240);
}

/**
 * Aplica un efecto visual de resaltado temporal a un elemento de mensaje.
 */
function highlightMessage(element) {
  element.classList.remove("message-highlight");
  void element.offsetWidth; // Force reflow
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
  }, 2600);
}

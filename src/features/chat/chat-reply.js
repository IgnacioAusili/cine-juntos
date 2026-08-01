import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { truncateText } from "./chat-content-parser.js";
import { getParticipantAccent } from "./chat-participant-color.js";

const pendingReplyPreviewHides = new WeakMap();
const pendingReplyPreviewShow = new WeakMap();
const pendingReplyPreviewAnimations = new WeakMap();
const pendingOverlayHighlights = new WeakMap();
const pendingOverlayHighlightTimers = new WeakMap();

/**
 * Establece el mensaje al que se está respondiendo y actualiza la vista previa.
 * @param {Object} message - El objeto del mensaje original.
 * @param {HTMLElement} [focusInput] - Input que debe recuperar el foco.
 */
export function setReplyTarget(message, focusInput = dom.messageInput) {
  const isSameReplyTarget = state.chat.replyTarget?.id === message.id;
  state.chat.replyTarget = {
    id: message.id,
    from: message.from || null,
    name: message.name || "Invitado",
    text: message.text || "",
  };
  renderReplyPreview({ animate: !isSameReplyTarget });
  focusInput?.focus({ preventScroll: true });
}

/**
 * Limpia el objetivo de respuesta y oculta la vista previa.
 */
export function clearReplyTarget() {
  state.chat.replyTarget = null;
  renderReplyPreview();
}

/**
 * Renderiza la vista previa de la respuesta en los inputs (normal y overlay).
 */
export function renderReplyPreview({ animate = true } = {}) {
  const getExpandedReplyHeight = (container) => Math.max(container.scrollHeight, 42);
  const cancelPreviewAnimation = (container) => {
    const animation = pendingReplyPreviewAnimations.get(container);
    if (animation) {
      animation.cancel();
      pendingReplyPreviewAnimations.delete(container);
    }
  };

  [dom.replyPreview, dom.overlayReplyPreview].forEach((container) => {
    if (!container) return;
    const previousHideTimer = pendingReplyPreviewHides.get(container);
    if (previousHideTimer != null) {
      window.clearTimeout(previousHideTimer);
      pendingReplyPreviewHides.delete(container);
    }
    cancelPreviewAnimation(container);
    const previousShowFrame = pendingReplyPreviewShow.get(container);
    if (previousShowFrame != null) {
      window.cancelAnimationFrame(previousShowFrame);
      pendingReplyPreviewShow.delete(container);
    }
    if (!state.chat.replyTarget) {
      container.style.removeProperty("--reply-participant-accent");
      const startHeight = container.getBoundingClientRect().height;
      container.style.height = `${startHeight}px`;
      container.classList.remove("reply-preview--visible");
      const animation = container.animate(
        [{ height: `${startHeight}px` }, { height: "0px" }],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      pendingReplyPreviewAnimations.set(container, animation);
      animation.onfinish = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
        container.style.height = "0px";
      };
      animation.oncancel = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
      };
      const hideTimer = window.setTimeout(() => {
        if (!state.chat.replyTarget) {
          container.hidden = true;
          container.innerHTML = "";
          container.style.removeProperty("height");
        }
        pendingReplyPreviewHides.delete(container);
      }, 240);
      pendingReplyPreviewHides.set(container, hideTimer);
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
    const preferredScrollContainer = container === dom.overlayReplyPreview ? dom.overlayMessages : dom.messages;
    textBtn.addEventListener("click", () =>
      scrollToMessage(state.chat.replyTarget.id, preferredScrollContainer),
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

    if (!animate) {
      container.style.setProperty("transition", "none");
      container.classList.add("reply-preview--visible");
      container.style.removeProperty("height");
      void container.offsetHeight;
      container.style.removeProperty("transition");
      return;
    }

    container.style.height = "0px";
    const targetHeight = getExpandedReplyHeight(container);
    const showFrame = window.requestAnimationFrame(() => {
      pendingReplyPreviewShow.delete(container);
      container.classList.add("reply-preview--visible");
      const animation = container.animate(
        [{ height: "0px" }, { height: `${targetHeight}px` }],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      pendingReplyPreviewAnimations.set(container, animation);
      animation.onfinish = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
        container.style.height = `${targetHeight}px`;
      };
      animation.oncancel = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
      };
    });
    pendingReplyPreviewShow.set(container, showFrame);
  });
}

/**
 * Desplaza la vista hasta un mensaje específico y lo resalta.
 * @param {string} messageId - El ID del mensaje al que desplazarse.
 * @param {HTMLElement|null} [preferredContainer] - Contenedor a priorizar.
 */
export function scrollToMessage(messageId, preferredContainer = null) {
  if (!messageId) return;
  const containers = [preferredContainer, dom.overlayMessages, dom.messages].filter(
    (container, index, all) => container && all.indexOf(container) === index,
  );
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

/**
 * Aplica un efecto visual de resaltado temporal a un elemento de mensaje.
 */
function highlightMessage(element) {
  const overlayContainer = element.closest(".overlay-messages");
  if (overlayContainer) {
    highlightOverlayMessage(overlayContainer, element);
    return;
  }

  element.classList.remove("message-highlight");
  void element.offsetWidth; // Force reflow
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
  }, 2600);
}

function highlightOverlayMessage(container, element) {
  const previousHighlight = pendingOverlayHighlights.get(container);
  if (previousHighlight) {
    previousHighlight.remove();
    pendingOverlayHighlights.delete(container);
  }
  const previousTimer = pendingOverlayHighlightTimers.get(container);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
    pendingOverlayHighlightTimers.delete(container);
  }

  const highlight = document.createElement("div");
  highlight.className = "message-highlight message-highlight--overlay";
  highlight.style.top = `${Math.max(0, element.offsetTop - 2)}px`;
  highlight.style.height = `${element.offsetHeight + 4}px`;
  container.append(highlight);
  pendingOverlayHighlights.set(container, highlight);

  void highlight.offsetWidth; // Force reflow for the pulse animation

  const timer = window.setTimeout(() => {
    if (pendingOverlayHighlights.get(container) !== highlight) return;
    highlight.remove();
    pendingOverlayHighlights.delete(container);
    pendingOverlayHighlightTimers.delete(container);
  }, 2600);
  pendingOverlayHighlightTimers.set(container, timer);
}

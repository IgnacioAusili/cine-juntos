import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { truncateText } from "./chat-content-parser.js?v=20260810-chat-fixes-02";
import { getParticipantAccent } from "./chat-participant-color.js";
import { expandSystemMessageGroupForItem } from "./system-message-groups.js?v=20260821-system-group-collapse-cleanup-01";

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
  focusInput?.focus({ preventScroll: true });
}

function getReplyLabel(message) {
  const text = String(message?.text || "").trim();
  if (text && !(text.startsWith("data:image/") && text.includes("base64,"))) return text;
  if (message?.image || (Array.isArray(message?.images) && message.images.length)) {
    return "(Imagen)";
  }
  return "";
}

/**
 * Limpia el objetivo de respuesta y oculta la vista previa.
 */
export function clearReplyTarget() {
  state.chat.replyTarget = null;
  state.chat.replyPreviewScope = "both";
  renderReplyPreview();
}

function hideReplyPreviewContainer(container) {
  container.classList.remove("reply-preview--visible");
  container.hidden = true;
  container.innerHTML = "";
  container.style.removeProperty("height");
  container.style.removeProperty("transition");
  container.style.removeProperty("clip-path");
  container.style.removeProperty("padding-top");
  container.style.removeProperty("padding-bottom");
  container.style.removeProperty("--reply-participant-accent");
}

function createReplyPreviewContent(container) {
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

  const replyContent = document.createElement("div");
  replyContent.className = "reply-preview-content";
  replyContent.append(replyIcon, textBtn, close);
  return replyContent;
}

/**
 * Renderiza la vista previa de la respuesta en los inputs (normal y overlay).
 */
export function renderReplyPreview({ animate = true, preserveHeight = false } = {}) {
  const getExpandedReplyHeight = (container) => Math.max(container.scrollHeight, 42);
  const cancelPreviewAnimation = (container) => {
    const animation = pendingReplyPreviewAnimations.get(container);
    if (animation) {
      animation.cancel();
      pendingReplyPreviewAnimations.delete(container);
    }
  };
  const showReplyPreview = (container, replyContent) => {
    container.innerHTML = "";
    container.append(replyContent);
    container.style.height = "0px";
    const targetHeight = getExpandedReplyHeight(container);
    const showFrame = window.requestAnimationFrame(() => {
      pendingReplyPreviewShow.delete(container);
      container.classList.add("reply-preview--visible");
      const animation = container.animate(
        [
          { height: "0px", opacity: 0 },
          { height: `${targetHeight}px`, opacity: 1 },
        ],
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
        animation.cancel();
      };
      animation.oncancel = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
      };
    });
    pendingReplyPreviewShow.set(container, showFrame);
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

    if (
      state.chat.replyTarget
      && state.chat.replyPreviewScope !== "both"
      && ((state.chat.replyPreviewScope === "overlay") !== (container === dom.overlayReplyPreview))
    ) {
      hideReplyPreviewContainer(container);
      return;
    }

    const visibleHeight =
      !container.hidden && container.classList.contains("reply-preview--visible")
        ? container.getBoundingClientRect().height
        : 0;
    const currentHeight = preserveHeight ? visibleHeight : 0;
    if (!state.chat.replyTarget) {
      const hideReplyPreview = () => {
        hideReplyPreviewContainer(container);
      };

      if (container.hidden && !container.classList.contains("reply-preview--visible")) {
        container.innerHTML = "";
        container.style.removeProperty("--reply-participant-accent");
        return;
      }

      container.style.removeProperty("--reply-participant-accent");
      if (!animate) {
        hideReplyPreview();
        return;
      }

      container.style.setProperty("transition", "none");
      const startHeight = container.getBoundingClientRect().height;
      const currentStyles = getComputedStyle(container);
      const startPaddingTop = currentStyles.paddingTop;
      const startPaddingBottom = currentStyles.paddingBottom;
      container.style.height = `${startHeight}px`;
      const animation = container.animate(
        [
          {
            height: `${startHeight}px`,
            paddingTop: startPaddingTop,
            paddingBottom: startPaddingBottom,
            opacity: 1,
          },
          {
            height: "0px",
            paddingTop: "0px",
            paddingBottom: "0px",
            opacity: 0,
          },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      pendingReplyPreviewAnimations.set(container, animation);
      let hideTimer = null;
      const finishClose = () => {
        if (state.chat.replyTarget) return;
        if (hideTimer != null) {
          window.clearTimeout(hideTimer);
          pendingReplyPreviewHides.delete(container);
          hideTimer = null;
        }
        if (pendingReplyPreviewAnimations.get(container) === animation) {
          pendingReplyPreviewAnimations.delete(container);
        }
        animation.onfinish = null;
        animation.oncancel = null;
        animation.cancel();
        hideReplyPreview();
      };
      animation.onfinish = finishClose;
      animation.oncancel = () => {
        if (pendingReplyPreviewAnimations.get(container) !== animation) return;
        pendingReplyPreviewAnimations.delete(container);
      };
      hideTimer = window.setTimeout(finishClose, 260);
      pendingReplyPreviewHides.set(container, hideTimer);
      return;
    }

    container.style.removeProperty("transition");
    container.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(state.chat.replyTarget.from || state.chat.replyTarget.id || state.chat.replyTarget.name),
    );
    const nextReplyContent = createReplyPreviewContent(container);
    container.hidden = false;

    if (!animate) {
      container.innerHTML = "";
      container.append(nextReplyContent);
      container.style.setProperty("transition", "none");
      container.classList.add("reply-preview--visible");
      if (visibleHeight > 0) {
        container.style.height = `${visibleHeight}px`;
      } else {
        container.style.height = `${getExpandedReplyHeight(container)}px`;
      }
      void container.offsetHeight;
      container.style.removeProperty("transition");
      return;
    }

    if (currentHeight > 0) {
      container.style.height = `${currentHeight}px`;
      container.classList.add("reply-preview--visible");
      const exitAnimation = container.animate(
        [
          { height: `${currentHeight}px`, opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      pendingReplyPreviewAnimations.set(container, exitAnimation);
      exitAnimation.onfinish = () => {
        if (pendingReplyPreviewAnimations.get(container) !== exitAnimation) return;
        pendingReplyPreviewAnimations.delete(container);
        exitAnimation.cancel();
        if (!state.chat.replyTarget) return;
        showReplyPreview(container, nextReplyContent);
      };
      exitAnimation.oncancel = () => {
        if (pendingReplyPreviewAnimations.get(container) !== exitAnimation) return;
        pendingReplyPreviewAnimations.delete(container);
      };
      return;
    }

    showReplyPreview(container, nextReplyContent);
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
      const expansion = expandSystemMessageGroupForItem(target);
      if (expansion) {
        expansion.then(() => scrollToMessage(messageId, container));
        return;
      }

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

  const highlightContainer = element.closest(".messages");
  if (highlightContainer) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = highlightContainer.getBoundingClientRect();
    element.style.setProperty("--message-highlight-left", `${containerRect.left - elementRect.left - 2}px`);
    element.style.setProperty("--message-highlight-width", `${containerRect.width + 4}px`);
  }

  element.classList.remove("message-highlight");
  void element.offsetWidth; // Force reflow
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
    element.style.removeProperty("--message-highlight-left");
    element.style.removeProperty("--message-highlight-width");
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

import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { truncateText } from "./chat-content-parser.js?v=20261010-file-size-refactor-02";
import { getParticipantAccent } from "./chat-participant-color.js?v=20261010-file-size-refactor-02";
import { scrollToMessage } from "./chat-message-navigation.js?v=20261011-chat-interaction-fixes-01";

let clearReplyTargetCallback = null;
export function configureReplyPreviewOperations({ clearReplyTarget } = {}) { clearReplyTargetCallback = clearReplyTarget || null; }
function clearReplyTargetFromPreview() {
  if (!clearReplyTargetCallback) throw new Error("La vista previa de respuesta requiere la operación de cierre.");
  clearReplyTargetCallback();
}

const pendingReplyPreviewHides = new WeakMap();
const pendingReplyPreviewShow = new WeakMap();
const pendingReplyPreviewAnimations = new WeakMap();

function setReplyPreviewClosing(container, isClosing) {
  const form = container.closest(".message-form");
  if (!form || form.classList.contains("reply-preview-closing") === isClosing) return;
  form.classList.toggle("reply-preview-closing", isClosing);
  window.dispatchEvent(new Event("chat-reply-preview-layout"));
}

function hideReplyPreviewContainer(container) {
  container.hidden = true;
  setReplyPreviewClosing(container, false);
  container.classList.remove("reply-preview--visible");
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
  close.addEventListener("click", clearReplyTargetFromPreview);

  const replyContent = document.createElement("div");
  replyContent.className = "reply-preview-content";
  replyContent.append(replyIcon, textBtn, close);
  return replyContent;
}

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
    setReplyPreviewClosing(container, false);
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
          duration: 180,
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
        setReplyPreviewClosing(container, false);
        container.innerHTML = "";
        container.style.removeProperty("--reply-participant-accent");
        return;
      }

      container.style.removeProperty("--reply-participant-accent");
      if (!animate) {
        hideReplyPreview();
        return;
      }

      // El formulario libera su reserva al mismo tiempo que empieza a
      // contraerse el preview; no esperamos a ocultarlo por completo.
      setReplyPreviewClosing(container, true);
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
          duration: 180,
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
      hideTimer = window.setTimeout(finishClose, 200);
      pendingReplyPreviewHides.set(container, hideTimer);
      return;
    }

    container.style.removeProperty("transition");
    container.style.setProperty(
      "--reply-participant-accent",
      getParticipantAccent(state.chat.replyTarget.name),
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
          duration: 180,
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

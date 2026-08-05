// Cableado de interacciones del mensaje: listeners de puntero, long-press y contextmenu.
// El motor de gesto vive en swipe-reply.js.
import { state } from "../../core/state.js";
import { createSwipeReply } from "./swipe-reply.js";
import { showMessageMenu } from "./message-menu.js";

const LONG_PRESS_DELAY = 560;

export function wireMessageInteractions(
  bubble,
  message,
  hint,
  {
    setReplyTarget,
    replyInput,
    companions = [],
    interactionTarget = bubble,
    interactionBand = interactionTarget,
  },
) {
  const swipe = createSwipeReply(bubble, hint, {
    onReply: () => setReplyTarget?.(message, replyInput),
    companions,
    pointerCaptureTarget: interactionTarget,
  });

  function clearLongPress() {
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = null;
    state.chat.longPressStart = null;
  }

  function armLongPress(event) {
    state.chat.longPressStart = { x: event.clientX, y: event.clientY, message };
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = window.setTimeout(() => {
      if (!swipe.directionLocked && swipe.tracking) {
        showMessageMenu(message, event.clientX, event.clientY, replyInput);
      }
    }, LONG_PRESS_DELAY);
  }

  function isWithinInteractionBand(event) {
    if (interactionBand === interactionTarget) return true;
    const rect = interactionBand.getBoundingClientRect();
    return event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  // --- listeners ---

  interactionTarget.addEventListener("contextmenu", (event) => {
    if (!isWithinInteractionBand(event)) return;
    event.preventDefault();
    showMessageMenu(message, event.clientX, event.clientY, replyInput);
  });

  interactionTarget.addEventListener("dragstart", (event) => {
    if (bubble.contains(event.target)) return;
    event.preventDefault();
  });

  interactionTarget.addEventListener("click", (event) => {
    if (!swipe.blockClick) return;
    swipe.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  interactionTarget.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    if (!isWithinInteractionBand(event)) return;
    // La burbuja queda fuera de la superficie de reply para permitir
    // seleccionar texto sin que el gesto intercepte el puntero.
    if (bubble.contains(event.target)) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select")) {
      return;
    }
    if (event.pointerType !== "touch") {
      event.preventDefault();
    }
    swipe.beginSwipe(event);
    if (event.pointerType === "touch") {
      armLongPress(event);
    } else {
      clearLongPress();
    }
  });

  interactionTarget.addEventListener("pointermove", (event) => {
    if (!swipe.tracking || event.pointerId !== swipe.pointerId) return;
    swipe.updateSwipe(event.clientX, event.clientY);
  });

  interactionTarget.addEventListener("pointerup", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    clearLongPress();
    swipe.endSwipe();
  });

  interactionTarget.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    clearLongPress();
    swipe.cancelSwipe(swipe.offset > 0);
  });

  interactionTarget.addEventListener("lostpointercapture", () => {
    if (swipe.tracking) {
      clearLongPress();
      swipe.cancelSwipe(swipe.offset > 0);
    }
  });
}

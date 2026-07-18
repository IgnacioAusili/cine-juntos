// Cableado de interacciones del mensaje: listeners de puntero, long-press y contextmenu.
// El motor de gesto vive en swipe-reply.js.
import { state } from "../../core/state.js";
import { createSwipeReply } from "./swipe-reply.js";
import { showMessageMenu } from "./message-menu.js";

const LONG_PRESS_DELAY = 560;

export function wireMessageInteractions(bubble, message, hint, { setReplyTarget }) {
  const swipe = createSwipeReply(bubble, hint, {
    onReply: () => setReplyTarget?.(message),
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
        showMessageMenu(message, event.clientX, event.clientY);
      }
    }, LONG_PRESS_DELAY);
  }

  // --- listeners ---

  bubble.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMessageMenu(message, event.clientX, event.clientY);
  });

  bubble.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  bubble.addEventListener("click", (event) => {
    if (!swipe.blockClick) return;
    swipe.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  bubble.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
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

  bubble.addEventListener("pointermove", (event) => {
    if (!swipe.tracking || event.pointerId !== swipe.pointerId) return;
    swipe.updateSwipe(event.clientX, event.clientY);
  });

  bubble.addEventListener("pointerup", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    clearLongPress();
    swipe.endSwipe();
  });

  bubble.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    clearLongPress();
    swipe.cancelSwipe(swipe.offset > 0);
  });

  bubble.addEventListener("lostpointercapture", () => {
    if (swipe.tracking) {
      clearLongPress();
      swipe.cancelSwipe(swipe.offset > 0);
    }
  });
}

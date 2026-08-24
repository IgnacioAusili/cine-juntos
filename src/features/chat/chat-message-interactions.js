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
    interactionBands = [],
    allowSwipeInsideBubble = false,
  },
) {
  const swipeBands = [interactionBand, ...interactionBands].filter(Boolean);
  const swipe = createSwipeReply(bubble, hint, {
    onReply: () => setReplyTarget?.(message, replyInput),
    companions,
    pointerCaptureTarget: interactionTarget,
  });
  let longPressPointerId = null;
  let longPressStart = null;
  let longPressTriggered = false;

  function clearLongPress() {
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = null;
    state.chat.longPressStart = null;
    longPressPointerId = null;
    longPressStart = null;
  }

  function armLongPress(event) {
    longPressTriggered = false;
    longPressPointerId = event.pointerId;
    longPressStart = { x: event.clientX, y: event.clientY };
    state.chat.longPressStart = { x: event.clientX, y: event.clientY, message };
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = window.setTimeout(() => {
      if (
        longPressPointerId === event.pointerId
        && longPressStart
      ) {
        longPressTriggered = true;
        showMessageMenu(message, event.clientX, event.clientY, replyInput);
      }
    }, LONG_PRESS_DELAY);
  }

  function isWithinInteractionBand(event) {
    if (swipeBands.includes(interactionTarget)) return true;
    return swipeBands.some((band) => {
      const rect = band.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
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
    if (longPressTriggered) {
      longPressTriggered = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!swipe.blockClick) return;
    swipe.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  interactionTarget.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    if (!isWithinInteractionBand(event)) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select")) {
      return;
    }
    if (!allowSwipeInsideBubble && bubble.contains(event.target)) {
      if (event.pointerType === "touch") armLongPress(event);
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
    if (longPressStart && longPressPointerId === event.pointerId) {
      const movedX = event.clientX - longPressStart.x;
      const movedY = event.clientY - longPressStart.y;
      if (Math.hypot(movedX, movedY) > 10) clearLongPress();
    }
    if (!swipe.tracking || event.pointerId !== swipe.pointerId) return;
    swipe.updateSwipe(event.clientX, event.clientY);
  });

  interactionTarget.addEventListener("pointerup", (event) => {
    clearLongPress();
    if (event.pointerId !== swipe.pointerId) return;
    swipe.endSwipe();
  });

  interactionTarget.addEventListener("pointercancel", (event) => {
    clearLongPress();
    if (event.pointerId !== swipe.pointerId) return;
    swipe.cancelSwipe(swipe.offset > 0);
  });

  interactionTarget.addEventListener("lostpointercapture", () => {
    clearLongPress();
    if (swipe.tracking) {
      swipe.cancelSwipe(swipe.offset > 0);
    }
  });
}

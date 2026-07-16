import { dom } from "../core/dom.js";
import { state, logEvent } from "../core/state.js";

export function wireMessageInteractions(bubble, message, hint, { setReplyTarget }) {
  const SWIPE_THRESHOLD = 36;
  const SWIPE_MAX_DRAG = 96;
  const LOCK_DISTANCE = 10;
  const VERTICAL_CANCEL_BIAS = 6;
  const LONG_PRESS_DELAY = 560;
  const RESTORE_DURATION_MS = 220;
  const ACTIVE_OFFSET_EPSILON = 2;
  const DEBUG_PREFIX = `[reply-swipe:${String(message.id || "unknown").slice(-6)}]`;

  const swipe = {
    state: "idle",
    pointerId: null,
    pointerType: "",
    tracking: false,
    directionLocked: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    currentDx: 0,
    currentDy: 0,
    offset: 0,
    progress: 0,
    hintVisible: false,
    thresholdReached: false,
    renderFrameId: 0,
    pendingRenderReason: "init",
    animationCleanup: null,
    blockClick: false,
    confirmPulseTimer: null,
  };

  function roundValue(value, decimals = 2) {
    return Number(Number(value || 0).toFixed(decimals));
  }

  function debugSwipe(event, details = {}) {
    console.log(`${DEBUG_PREFIX} ${event}`, {
      state: swipe.state,
      pointerId: swipe.pointerId,
      pointerType: swipe.pointerType || "none",
      tracking: swipe.tracking,
      directionLocked: swipe.directionLocked,
      startX: roundValue(swipe.startX),
      startY: roundValue(swipe.startY),
      currentX: roundValue(swipe.currentX),
      currentY: roundValue(swipe.currentY),
      dx: roundValue(swipe.currentDx),
      dy: roundValue(swipe.currentDy),
      offset: roundValue(swipe.offset),
      progress: roundValue(swipe.progress, 3),
      threshold: SWIPE_THRESHOLD,
      maxDrag: SWIPE_MAX_DRAG,
      ...details,
    });
  }

  function clearLongPress(reason) {
    window.clearTimeout(state.chat.longPressTimer);
    state.chat.longPressTimer = null;
    if (state.chat.longPressStart) {
      debugSwipe("long-press-clear", { reason });
    }
    state.chat.longPressStart = null;
  }

  function setState(nextState, reason) {
    if (swipe.state === nextState) return;
    debugSwipe("state-change", { from: swipe.state, to: nextState, reason });
    swipe.state = nextState;
    bubble.dataset.replySwipeState = nextState;
    const manualState = nextState === "dragging" || nextState === "reply-ready";
    bubble.classList.toggle("swipe-dragging", manualState);
    bubble.classList.toggle("swipe-settling", nextState === "settling");
  }

  function setHintVisible(visible, reason) {
    if (swipe.hintVisible === visible) return;
    swipe.hintVisible = visible;
    debugSwipe(visible ? "reply-icon-show" : "reply-icon-hide", { reason });
  }

  function setThresholdReached(reached, reason) {
    if (swipe.thresholdReached === reached) return;
    swipe.thresholdReached = reached;
    bubble.classList.toggle("swipe-ready", reached);
    debugSwipe(reached ? "threshold-enter" : "threshold-exit", {
      reason,
      offset: roundValue(swipe.offset),
    });
    if (reached) {
      setState("reply-ready", reason);
    } else if (swipe.tracking) {
      setState("dragging", reason);
    }
  }

  function cancelAnimation(reason) {
    if (!swipe.animationCleanup) return;
    debugSwipe("animation-cancel", { reason });
    swipe.animationCleanup();
    swipe.animationCleanup = null;
  }

  function setTransitions(value) {
    bubble.style.transition = value;
    hint.style.transition = value ? `${value}, opacity 160ms ease` : "none";
  }

  function renderSwipeFrame(reason) {
    swipe.renderFrameId = 0;
    const offset = Math.max(0, Math.min(swipe.offset, SWIPE_MAX_DRAG));
    const progress = Math.min(offset / SWIPE_THRESHOLD, 1);
    const hintOpacity = offset <= ACTIVE_OFFSET_EPSILON ? 0 : Math.min(1, 0.14 + progress * 0.86);
    const hintScale = 0.72 + progress * 0.28;
    const hintX = -Math.min(5 + offset * 0.22, 20);

    swipe.progress = progress;

    bubble.style.transform = offset > 0 ? `translateX(${-offset}px)` : "";
    hint.style.opacity = hintOpacity > 0 ? String(hintOpacity) : "0";
    hint.style.transform = `translate(${roundValue(hintX)}px, -50%) scale(${roundValue(hintScale, 3)})`;

    setHintVisible(offset > ACTIVE_OFFSET_EPSILON, reason);
    setThresholdReached(offset >= SWIPE_THRESHOLD, reason);

    debugSwipe("frame", {
      reason,
      distance: roundValue(Math.abs(swipe.currentDx)),
      hintOpacity: roundValue(hintOpacity, 3),
      hintScale: roundValue(hintScale, 3),
      hintX: roundValue(hintX),
    });
  }

  function queueRender(reason) {
    swipe.pendingRenderReason = reason;
    if (swipe.renderFrameId) return;
    swipe.renderFrameId = window.requestAnimationFrame(() => {
      renderSwipeFrame(swipe.pendingRenderReason);
    });
  }

  function resetSwipeVisuals(reason) {
    if (swipe.renderFrameId) {
      window.cancelAnimationFrame(swipe.renderFrameId);
      swipe.renderFrameId = 0;
    }
    bubble.style.transition = "";
    bubble.style.transform = "";
    hint.style.transition = "";
    hint.style.opacity = "0";
    hint.style.transform = "translate(-6px, -50%) scale(0.72)";
    bubble.classList.remove("swipe-dragging", "swipe-settling", "swipe-ready", "swipe-confirmed");
    if (swipe.hintVisible) {
      swipe.hintVisible = false;
      debugSwipe("reply-icon-hide", { reason });
    }
    if (swipe.thresholdReached) {
      swipe.thresholdReached = false;
      debugSwipe("threshold-exit", { reason, offset: 0 });
    }
    debugSwipe("restore-origin", { reason });
  }

  function releasePointerCapture(reason) {
    if (swipe.pointerId == null) return;
    if (!bubble.hasPointerCapture?.(swipe.pointerId)) return;
    try {
      bubble.releasePointerCapture(swipe.pointerId);
      debugSwipe("pointer-capture-release", { reason });
    } catch (error) {
      debugSwipe("pointer-capture-release-failed", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function finalizeInteraction(reason) {
    swipe.tracking = false;
    releasePointerCapture(reason);
    clearLongPress(reason);
    swipe.directionLocked = false;
    swipe.pointerId = null;
    swipe.pointerType = "";
    swipe.startX = 0;
    swipe.startY = 0;
    swipe.currentX = 0;
    swipe.currentY = 0;
    swipe.currentDx = 0;
    swipe.currentDy = 0;
    swipe.offset = 0;
    swipe.progress = 0;
    swipe.animationCleanup = null;
    setState("idle", reason);
  }

  function animateToOffset(targetOffset, options = {}) {
    const {
      reason,
      duration = RESTORE_DURATION_MS,
      easing = "cubic-bezier(0.22, 1, 0.36, 1)",
      onComplete,
    } = options;

    cancelAnimation(`restart:${reason}`);
    setState("settling", reason);
    setTransitions(`transform ${duration}ms ${easing}`);
    swipe.offset = Math.max(0, Math.min(targetOffset, SWIPE_MAX_DRAG));
    debugSwipe("animation-start", {
      reason,
      duration,
      easing,
      targetOffset: roundValue(swipe.offset),
    });
    queueRender(`animation:${reason}`);

    let completed = false;
    const finish = (finishReason) => {
      if (completed) return;
      completed = true;
      bubble.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallbackTimer);
      bubble.style.transition = "";
      hint.style.transition = "";
      swipe.animationCleanup = null;
      debugSwipe("animation-end", {
        reason,
        finishReason,
        targetOffset: roundValue(swipe.offset),
      });
      onComplete?.();
    };

    const onTransitionEnd = (event) => {
      if (event.propertyName !== "transform") return;
      finish("transitionend");
    };

    const fallbackTimer = window.setTimeout(() => {
      finish("timeout");
    }, duration + 80);

    bubble.addEventListener("transitionend", onTransitionEnd);
    swipe.animationCleanup = () => {
      bubble.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallbackTimer);
      bubble.style.transition = "";
      hint.style.transition = "";
    };
  }

  function triggerReplyConfirmation(reason) {
    debugSwipe("reply-activate", {
      reason,
      replyTargetId: message.id,
      replyAuthor: message.name || "Invitado",
    });
    bubble.classList.add("swipe-confirmed");
    debugSwipe("confirmation-pulse-start", { reason });
    window.clearTimeout(swipe.confirmPulseTimer);
    swipe.confirmPulseTimer = window.setTimeout(() => {
      bubble.classList.remove("swipe-confirmed");
      debugSwipe("confirmation-pulse-end", { reason });
    }, 180);
    setReplyTarget?.(message);
    animateToOffset(0, {
      reason: `${reason}:return`,
      onComplete: () => {
        resetSwipeVisuals(`${reason}:return-complete`);
        finalizeInteraction(`${reason}:complete`);
      },
    });
  }

  function cancelSwipe(reason, shouldAnimate) {
    debugSwipe("reply-cancel", {
      reason,
      shouldAnimate,
      offset: roundValue(swipe.offset),
    });

    if (shouldAnimate && swipe.offset > 0) {
      animateToOffset(0, {
        reason,
        onComplete: () => {
          resetSwipeVisuals(`${reason}:return-complete`);
          finalizeInteraction(`${reason}:complete`);
        },
      });
      return;
    }

    cancelAnimation(reason);
    resetSwipeVisuals(reason);
    finalizeInteraction(reason);
  }

  function beginSwipe(event) {
    cancelAnimation("pointerdown");
    bubble.classList.remove("swipe-confirmed");
    window.clearTimeout(swipe.confirmPulseTimer);
    swipe.pointerId = event.pointerId;
    swipe.pointerType = event.pointerType || "mouse";
    swipe.tracking = true;
    swipe.directionLocked = false;
    swipe.startX = event.clientX;
    swipe.startY = event.clientY;
    swipe.currentX = event.clientX;
    swipe.currentY = event.clientY;
    swipe.currentDx = 0;
    swipe.currentDy = 0;
    swipe.offset = 0;
    swipe.progress = 0;
    swipe.blockClick = false;
    setTransitions("");
    setState("idle", "pointerdown");
    debugSwipe("drag-start", {
      button: event.button,
      pointerType: swipe.pointerType,
      threshold: SWIPE_THRESHOLD,
      maxDrag: SWIPE_MAX_DRAG,
    });

    try {
      bubble.setPointerCapture(event.pointerId);
      debugSwipe("pointer-capture-set", { pointerId: event.pointerId });
    } catch (error) {
      debugSwipe("pointer-capture-failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (swipe.pointerType === "touch") {
      state.chat.longPressStart = { x: event.clientX, y: event.clientY, message };
      window.clearTimeout(state.chat.longPressTimer);
      state.chat.longPressTimer = window.setTimeout(() => {
        debugSwipe("long-press-fire", {
          x: roundValue(event.clientX),
          y: roundValue(event.clientY),
        });
        if (!swipe.directionLocked && swipe.tracking) {
          showMessageMenu(message, event.clientX, event.clientY);
        }
      }, LONG_PRESS_DELAY);
      debugSwipe("long-press-armed", { delay: LONG_PRESS_DELAY });
    } else {
      clearLongPress("pointerdown:non-touch");
    }
  }

  function updateSwipe(clientX, clientY) {
    if (!swipe.tracking) return;

    swipe.currentX = clientX;
    swipe.currentY = clientY;
    swipe.currentDx = clientX - swipe.startX;
    swipe.currentDy = clientY - swipe.startY;

    debugSwipe("pointer-move", {
      distance: roundValue(Math.abs(swipe.currentDx)),
      rawOffset: roundValue(-swipe.currentDx),
    });

    if (!swipe.directionLocked) {
      const absDx = Math.abs(swipe.currentDx);
      const absDy = Math.abs(swipe.currentDy);

      if (absDx < LOCK_DISTANCE && absDy < LOCK_DISTANCE) {
        return;
      }

      if (absDy > absDx + VERTICAL_CANCEL_BIAS) {
        cancelSwipe("vertical-cancel", swipe.offset > 0);
        return;
      }

      if (swipe.currentDx >= 0) {
        cancelSwipe("wrong-direction", false);
        return;
      }

      swipe.directionLocked = true;
      swipe.blockClick = true;
      clearLongPress("direction-lock");
      setState("dragging", "direction-lock");
      debugSwipe("direction-lock", {
        dx: roundValue(swipe.currentDx),
        dy: roundValue(swipe.currentDy),
      });
    }

    setTransitions("");
    swipe.offset = Math.max(0, Math.min(-swipe.currentDx, SWIPE_MAX_DRAG));
    queueRender("pointermove");
  }

  function endSwipe(reason) {
    clearLongPress(reason);

    if (!swipe.tracking) {
      debugSwipe("drag-end-ignored", { reason });
      finalizeInteraction(`${reason}:ignored`);
      return;
    }

    debugSwipe("drag-end", {
      reason,
      distance: roundValue(Math.abs(swipe.currentDx)),
      offset: roundValue(swipe.offset),
      ready: swipe.offset >= SWIPE_THRESHOLD,
    });
    swipe.tracking = false;

    if (!swipe.directionLocked) {
      cancelSwipe(`${reason}:no-lock`, false);
      return;
    }

    if (swipe.offset >= SWIPE_THRESHOLD) {
      triggerReplyConfirmation(reason);
      return;
    }

    cancelSwipe(`${reason}:below-threshold`, true);
  }

  bubble.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    debugSwipe("context-menu", {
      x: roundValue(event.clientX),
      y: roundValue(event.clientY),
    });
    showMessageMenu(message, event.clientX, event.clientY);
  });

  bubble.addEventListener("dragstart", (event) => {
    event.preventDefault();
    debugSwipe("native-drag-blocked", {
      tagName: event.target instanceof HTMLElement ? event.target.tagName : "unknown",
    });
  });

  bubble.addEventListener("click", (event) => {
    if (!swipe.blockClick) return;
    swipe.blockClick = false;
    event.preventDefault();
    event.stopPropagation();
    debugSwipe("click-suppressed", { reason: "swipe-gesture" });
  }, true);

  bubble.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select")) {
      debugSwipe("drag-start-ignored", { reason: "interactive-target" });
      return;
    }
    if (event.pointerType !== "touch") {
      event.preventDefault();
    }
    beginSwipe(event);
  });

  bubble.addEventListener("pointermove", (event) => {
    if (!swipe.tracking || event.pointerId !== swipe.pointerId) return;
    updateSwipe(event.clientX, event.clientY);
  });

  bubble.addEventListener("pointerup", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    swipe.currentX = event.clientX;
    swipe.currentY = event.clientY;
    swipe.currentDx = event.clientX - swipe.startX;
    swipe.currentDy = event.clientY - swipe.startY;
    endSwipe("pointerup");
  });

  bubble.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== swipe.pointerId) return;
    swipe.currentX = event.clientX;
    swipe.currentY = event.clientY;
    swipe.currentDx = event.clientX - swipe.startX;
    swipe.currentDy = event.clientY - swipe.startY;
    debugSwipe("pointer-cancel", { reason: "browser-cancelled" });
    cancelSwipe("pointercancel", swipe.offset > 0);
  });

  bubble.addEventListener("lostpointercapture", () => {
    debugSwipe("pointer-capture-lost", { tracking: swipe.tracking });
    if (swipe.tracking) {
      cancelSwipe("lostpointercapture", swipe.offset > 0);
    }
  });
}

export function showMessageMenu(message, x, y) {
  state.chat.menuMessage = message;
  state.chat.messageMenuOpenedAt = Date.now();
  dom.messageMenu.hidden = false;
  const rect = dom.messageMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  dom.messageMenu.style.left = `${left}px`;
  dom.messageMenu.style.top = `${top}px`;
}

export function hideMessageMenu() {
  state.chat.menuMessage = null;
  dom.messageMenu.hidden = true;
}

export function copyMessageText(message) {
  navigator.clipboard?.writeText(message.text || "").catch(() => {});
  logEvent("chat", "Mensaje copiado.");
}

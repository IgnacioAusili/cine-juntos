// Motor de gesto swipe-to-reply: factory que encapsula estado y animacion.
// Recibe elementos (bubble, hint) y un callback onReply. No toca estado global.
export function createSwipeReply(bubble, hint, { onReply }) {
  // El rail reservado por el layout permite deslizar sin que la burbuja toque el borde.
  const THRESHOLD = 34, MAX_DRAG = 64, LOCK_DIST = 10, V_BIAS = 6;
  const RESTORE_MS = 340, EPS = 2;
  const EASING = "cubic-bezier(0.22, 1, 0.36, 1)", OPACITY = "opacity 160ms ease";

  let state = "idle", pointerId = null, pointerType = "", tracking = false, directionLocked = false;
  let startX = 0, startY = 0, currentX = 0, currentY = 0, currentDx = 0, currentDy = 0;
  let offset = 0, progress = 0, renderFrameId = 0, animationCleanup = null;
  let blockClick = false, confirmPulseTimer = null, hintVisible = false, thresholdReached = false;
  function setTransitions(value) {
    bubble.style.transition = value;
    hint.style.transition = value ? `${value}, ${OPACITY}` : "none";
  }
  function setState(next) {
    if (state === next) return;
    state = next;
    bubble.dataset.replySwipeState = next;
    bubble.classList.toggle("swipe-dragging", next === "dragging" || next === "reply-ready");
    bubble.classList.toggle("swipe-settling", next === "settling");
  }
  function setThreshold(reached) {
    if (thresholdReached === reached) return;
    thresholdReached = reached;
    bubble.classList.toggle("swipe-ready", reached);
    if (reached) setState("reply-ready");
    else if (tracking) setState("dragging");
  }
  function queueRender() {
    if (!renderFrameId) renderFrameId = window.requestAnimationFrame(() => {
      renderFrameId = 0;
      offset = Math.max(0, Math.min(offset, MAX_DRAG));
      progress = Math.min(offset / THRESHOLD, 1);
      const hintOpacity = offset <= EPS ? 0 : Math.min(1, 0.14 + progress * 0.86);
      const hintScale = 0.72 + progress * 0.28;
      // La burbuja deja un hueco a la derecha; la flecha se centra siempre en ese hueco.
      const hintX = 13 - offset / 2;
      bubble.style.transform = offset > 0 ? `translateX(${-offset}px)` : "";
      hint.style.opacity = hintOpacity > 0 ? String(hintOpacity) : "0";
      hint.style.transform = `translate(${hintX}px, -50%) scale(${hintScale})`;
      hintVisible = offset > EPS;
      setThreshold(offset >= THRESHOLD);
    });
  }
  function resetVisuals() {
    if (renderFrameId) { window.cancelAnimationFrame(renderFrameId); renderFrameId = 0; }
    bubble.style.transition = bubble.style.transform = "";
    hint.style.transition = "";
    hint.style.opacity = "0";
    hint.style.transform = "translate(14px, -50%) scale(0.72)";
    bubble.classList.remove("swipe-dragging", "swipe-settling", "swipe-ready", "swipe-confirmed");
    hintVisible = thresholdReached = false;
  }
  function cancelAnimation() {
    if (!animationCleanup) return;
    animationCleanup();
    animationCleanup = null;
  }
  function animateTo(target, { duration = RESTORE_MS, easing = EASING, onComplete } = {}) {
    cancelAnimation();
    setState("settling");
    setTransitions(`transform ${duration}ms ${easing}`);
    offset = Math.max(0, Math.min(target, MAX_DRAG));
    queueRender();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      bubble.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
      bubble.style.transition = hint.style.transition = "";
      animationCleanup = null;
      onComplete?.();
    };
    const onEnd = (event) => { if (event.propertyName === "transform") finish(); };
    const fallback = window.setTimeout(finish, duration + 80);
    bubble.addEventListener("transitionend", onEnd);
    animationCleanup = () => {
      bubble.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }
  function finalize() {
    tracking = directionLocked = false;
    if (pointerId != null && bubble.hasPointerCapture?.(pointerId)) {
      try { bubble.releasePointerCapture(pointerId); } catch { /* liberada */ }
    }
    pointerId = null;
    pointerType = "";
    startX = startY = currentX = currentY = currentDx = currentDy = offset = progress = 0;
    animationCleanup = null;
    setState("idle");
  }
  function triggerReply() {
    bubble.classList.add("swipe-confirmed");
    window.clearTimeout(confirmPulseTimer);
    confirmPulseTimer = window.setTimeout(() => bubble.classList.remove("swipe-confirmed"), 180);
    onReply?.();
    animateTo(0, { onComplete: () => { resetVisuals(); finalize(); } });
  }
  function beginSwipe(event) {
    cancelAnimation();
    bubble.classList.remove("swipe-confirmed");
    window.clearTimeout(confirmPulseTimer);
    pointerId = event.pointerId;
    pointerType = event.pointerType || "mouse";
    tracking = true;
    directionLocked = false;
    startX = currentX = event.clientX;
    startY = currentY = event.clientY;
    currentDx = currentDy = offset = progress = 0;
    blockClick = false;
    setTransitions("");
    setState("idle");
    try { bubble.setPointerCapture(event.pointerId); } catch { /* invalida */ }
  }
  function cancelSwipe(shouldAnimate) {
    if (shouldAnimate && offset > 0) {
      animateTo(0, { onComplete: () => { resetVisuals(); finalize(); } });
      return;
    }
    cancelAnimation();
    resetVisuals();
    finalize();
  }
  function updateSwipe(clientX, clientY) {
    if (!tracking) return;
    currentX = clientX;
    currentY = clientY;
    currentDx = clientX - startX;
    currentDy = clientY - startY;
    if (!directionLocked) {
      const absDx = Math.abs(currentDx), absDy = Math.abs(currentDy);
      if (absDx < LOCK_DIST && absDy < LOCK_DIST) return;
      if (absDy > absDx + V_BIAS) { cancelSwipe(offset > 0); return; }
      if (currentDx >= 0) { cancelSwipe(false); return; }
      directionLocked = true;
      blockClick = true;
      setState("dragging");
    }
    setTransitions("");
    offset = Math.max(0, Math.min(-currentDx, MAX_DRAG));
    queueRender();
  }
  function endSwipe() {
    if (!tracking) { finalize(); return; }
    tracking = false;
    if (!directionLocked) { cancelSwipe(false); return; }
    if (offset >= THRESHOLD) { triggerReply(); return; }
    cancelSwipe(true);
  }
  return {
    beginSwipe, updateSwipe, endSwipe, cancelSwipe,
    get pointerId() { return pointerId; }, get tracking() { return tracking; },
    get offset() { return offset; }, get directionLocked() { return directionLocked; },
    get blockClick() { return blockClick; }, set blockClick(v) { blockClick = v; },
  };
}

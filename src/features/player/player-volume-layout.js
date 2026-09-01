const VOLUME_OPEN_CLASS = "is-volume-slider-open";
const VOLUME_LAYOUT_ATTRIBUTE = "data-volume-slider-layout";
// El popup es una ayuda temporal: cada interaccion vuelve a contar este
// segundo, pero sin actividad se oculta rapidamente para no tapar la barra.
const VOLUME_HIDE_DELAY_MS = 1000;
const VOLUME_VERTICAL_DENSITIES = new Set(["volume", "compact", "scroll"]);
const MOBILE_VIEWPORT_QUERY = "(max-width: 680px), (hover: none) and (pointer: coarse)";
const wiredGroups = new WeakSet();
const observedRoots = new WeakSet();
const observedDocuments = new WeakSet();
const hideTimers = new WeakMap();

export function wirePlayerVolumeLayouts() {
  observePlayerVolumeLayouts(document);
}

export function observePlayerVolumeLayouts(root) {
  if (!root || observedRoots.has(root)) return;
  observedRoots.add(root);
  const ownerDocument = root.nodeType === 9 ? root : root.ownerDocument;
  wireDocument(ownerDocument);
  scanVolumeGroups(root);

  if (typeof MutationObserver !== "function") return;
  const observer = new MutationObserver(() => scanVolumeGroups(root));
  observer.observe(root, { childList: true, subtree: true });
}

export function shouldToggleMuteFromVolumeButton(group) {
  if (!isVolumeSliderVertical(group)) return true;
  if (!group.classList.contains(VOLUME_OPEN_CLASS)) {
    openVolumeSlider(group);
    return false;
  }
  closeVolumeSlider(group);
  return true;
}

export function isVolumeSliderVertical(group) {
  const bar = group?.closest(".player-controls-bar");
  const barDensity = bar?.dataset.controlDensity;
  if (barDensity) return VOLUME_VERTICAL_DENSITIES.has(barDensity);
  return group?.dataset.volumeSliderLayout === "vertical"
    || false;
}

function scanVolumeGroups(root) {
  if (root.matches?.(".player-volume-group")) wireVolumeGroup(root);
  root.querySelectorAll?.(".player-volume-group").forEach(wireVolumeGroup);
}

function wireDocument(doc) {
  if (!doc || observedDocuments.has(doc)) return;
  observedDocuments.add(doc);
  let suppressedClickTarget = null;
  let suppressedClickTimer = null;
  let suppressedPointerId = null;
  let suppressedPointerStart = null;
  let suppressedPointerMoved = false;

  const clearSuppressedClick = () => {
    suppressedClickTarget = null;
    suppressedPointerId = null;
    suppressedPointerStart = null;
    suppressedPointerMoved = false;
    if (suppressedClickTimer != null) {
      (doc.defaultView || window).clearTimeout(suppressedClickTimer);
      suppressedClickTimer = null;
    }
  };

  const suppressOutsideClick = (target, pointerId, event) => {
    suppressedClickTarget = target;
    suppressedPointerId = pointerId ?? null;
    suppressedPointerStart = {
      x: event.clientX,
      y: event.clientY,
    };
    suppressedPointerMoved = false;
    if (suppressedClickTimer != null) {
      (doc.defaultView || window).clearTimeout(suppressedClickTimer);
    }
    suppressedClickTimer = (doc.defaultView || window).setTimeout(() => {
      clearSuppressedClick();
    }, 700);
  };

  const isSuppressedTarget = (target) => suppressedClickTarget
    && (target === suppressedClickTarget
      || suppressedClickTarget.contains?.(target)
      || target?.contains?.(suppressedClickTarget));

  const consumeSuppressedEvent = (event) => {
    if (!suppressedClickTarget) return false;
    const isPointerEnd = event.type === "pointerup";
    if (isPointerEnd) {
      if (suppressedPointerId == null || event.pointerId !== suppressedPointerId) return false;
      if (suppressedPointerMoved) {
        // Un arrastre iniciado fuera del slider no debe quedar bloqueado ni
        // dejar un estado pendiente que consuma un click posterior.
        clearSuppressedClick();
        return false;
      }
      suppressedPointerId = null;
      suppressedPointerStart = null;
    } else if (!isSuppressedTarget(event.target)) {
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") clearSuppressedClick();
    return true;
  };

  doc.addEventListener("pointerdown", (event) => {
    let closedAny = false;
    doc.querySelectorAll?.(`.${VOLUME_OPEN_CLASS}`).forEach((group) => {
      if (!group.contains(event.target)) {
        closeVolumeSlider(group);
        closedAny = true;
      }
    });
    if (!closedAny) return;
    const view = doc.defaultView || window;
    const isMobileViewport = view.matchMedia?.(MOBILE_VIEWPORT_QUERY).matches;
    if (!isMobileViewport) return;
    suppressOutsideClick(event.target, event.pointerId, event);
    // No interrumpir el pointerdown: si el gesto continúa como arrastre,
    // la página necesita recibirlo para poder desplazarse. El toque corto
    // se consume más tarde, en pointerup/click, una vez que sabemos que no
    // hubo movimiento.
  }, true);
  doc.addEventListener("pointermove", (event) => {
    if (suppressedPointerId == null || event.pointerId !== suppressedPointerId) return;
    const start = suppressedPointerStart;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
      suppressedPointerMoved = true;
    }
  }, true);
  doc.addEventListener("pointerup", consumeSuppressedEvent, true);
  doc.addEventListener("pointercancel", (event) => {
    if (suppressedPointerId == null || event.pointerId !== suppressedPointerId) return;
    clearSuppressedClick();
  }, true);
  doc.addEventListener("click", (event) => {
    consumeSuppressedEvent(event);
  }, true);
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    doc.querySelectorAll?.(`.${VOLUME_OPEN_CLASS}`).forEach(closeVolumeSlider);
  }, true);
}

function wireVolumeGroup(group) {
  if (wiredGroups.has(group)) return;
  const bar = group.closest(".player-controls-bar");
  if (!bar) return;
  wiredGroups.add(group);
  const view = group.ownerDocument.defaultView || window;
  const schedule = createFrameScheduler(() => syncVolumeSliderLayout(group, bar), view);
  const input = group.querySelector(".player-volume-input");
  let activeSliderPointerId = null;

  group.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".player-volume-slider-wrap")) return;
    if (isVolumeSliderVertical(group)) openVolumeSlider(group);
    else scheduleHide(group);
  });
  group.addEventListener("focusin", (event) => {
    if (event.target !== input) return;
    if (isVolumeSliderVertical(group)) openVolumeSlider(group);
  });
  group.addEventListener("input", () => {
    if (isVolumeSliderVertical(group)) scheduleHide(group);
  });
  input?.addEventListener("pointerdown", (event) => {
    if (!isVolumeSliderVertical(group)) return;
    activeSliderPointerId = event.pointerId;
    openVolumeSlider(group);
    try {
      input.setPointerCapture?.(event.pointerId);
    } catch {
      // Algunos navegadores rechazan la captura en eventos sintéticos o
      // cuando el puntero ya fue liberado; el slider sigue funcionando igual.
    }
  });
  input?.addEventListener("pointermove", (event) => {
    if (activeSliderPointerId !== event.pointerId) return;
    event.preventDefault();
    scheduleHide(group);
  }, { passive: false });
  const releaseSliderPointer = (event) => {
    if (activeSliderPointerId !== event.pointerId) return;
    activeSliderPointerId = null;
    if (input?.hasPointerCapture?.(event.pointerId)) {
      input.releasePointerCapture(event.pointerId);
    }
    scheduleHide(group);
  };
  input?.addEventListener("pointerup", releaseSliderPointer);
  input?.addEventListener("pointercancel", releaseSliderPointer);
  group.addEventListener("pointerup", () => {
    if (group.classList.contains(VOLUME_OPEN_CLASS)) scheduleHide(group);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVolumeSlider(group);
      return;
    }
    if (group.classList.contains(VOLUME_OPEN_CLASS)) scheduleHide(group);
  });

  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(schedule);
    observer.observe(bar, { attributes: true, attributeFilter: ["data-control-density", "style", "class"] });
  }
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    const zone = bar.querySelector(".player-controls-scroll-zone");
    if (zone) observer.observe(zone);
  } else {
    view.addEventListener("resize", schedule, { passive: true });
  }
  schedule();
}

function syncVolumeSliderLayout(group, bar) {
  const useVertical = VOLUME_VERTICAL_DENSITIES.has(bar.dataset.controlDensity);
  const layout = useVertical ? "vertical" : "horizontal";
  if (group.dataset.volumeSliderLayout === layout) return;
  group.dataset.volumeSliderLayout = layout;
  if (layout === "horizontal") closeVolumeSlider(group);
}

function openVolumeSlider(group) {
  clearHideTimer(group);
  group.classList.add(VOLUME_OPEN_CLASS);
  group.querySelector(".video-control-button")?.setAttribute("aria-expanded", "true");
  scheduleHide(group);
}

function closeVolumeSlider(group) {
  clearHideTimer(group);
  group.classList.remove(VOLUME_OPEN_CLASS);
  group.querySelector(".video-control-button")?.setAttribute("aria-expanded", "false");
  const active = group.ownerDocument.activeElement;
  if (active && active !== group.querySelector(".video-control-button") && group.contains(active)) active.blur();
}

function scheduleHide(group) {
  clearHideTimer(group);
  const view = group.ownerDocument.defaultView || window;
  hideTimers.set(group, view.setTimeout(() => closeVolumeSlider(group), VOLUME_HIDE_DELAY_MS));
}

function clearHideTimer(group) {
  const timer = hideTimers.get(group);
  if (timer == null) return;
  const view = group.ownerDocument.defaultView || window;
  view.clearTimeout(timer);
  hideTimers.delete(group);
}

function createFrameScheduler(callback, view = window) {
  let frame = 0;
  const run = () => {
    frame = 0;
    callback();
  };
  return () => {
    if (frame) return;
    frame = view?.requestAnimationFrame ? view.requestAnimationFrame(run) : requestAnimationFrame(run);
  };
}

const DENSITIES = ["comfortable", "close", "volume", "tight", "compact", "scroll"];
const VOLUME_VERTICAL_DENSITIES = new Set(["volume", "compact", "scroll"]);
const wiredBars = new WeakSet();
const observedRoots = new WeakSet();

export function wirePlayerControlLayouts() {
  observePlayerControlLayouts(document);
}

export function observePlayerControlLayouts(root) {
  if (!root || observedRoots.has(root)) return;
  observedRoots.add(root);
  scanForControlBars(root);

  if (typeof MutationObserver !== "function") return;
  const observer = new MutationObserver(() => scanForControlBars(root));
  observer.observe(root, { childList: true, subtree: true });
}

function scanForControlBars(root) {
  root.querySelectorAll?.(".player-controls-bar").forEach(wireControlBar);
}

function wireControlBar(bar) {
  if (wiredBars.has(bar)) return;

  const scrollZone = bar.querySelector(".player-controls-scroll-zone");
  const scrollWindow = bar.querySelector(".player-controls-scroll-window");
  const indicator = bar.querySelector(".player-controls-scroll-indicator");
  if (!scrollZone || !scrollWindow || !indicator) return;

  wiredBars.add(bar);
  const view = bar.ownerDocument.defaultView || window;
  const schedule = createFrameScheduler(
    () => syncControlBar(bar, scrollZone, scrollWindow, indicator),
    view,
  );

  scrollWindow.addEventListener(
    "scroll",
    () => syncScrollIndicator(scrollZone, scrollWindow, indicator),
    { passive: true },
  );
  scrollWindow.addEventListener(
    "wheel",
    (event) => handleScrollWheel(event, scrollWindow),
    { passive: false },
  );
  scrollWindow.addEventListener("keydown", (event) => handleScrollKeydown(event, scrollWindow));
  indicator.addEventListener("input", () => {
    const maxScroll = Math.max(0, scrollWindow.scrollWidth - scrollWindow.clientWidth);
    scrollWindow.scrollLeft = Math.min(maxScroll, Math.max(0, Number(indicator.value) || 0));
    syncScrollIndicator(scrollZone, scrollWindow, indicator);
  });

  if (typeof MutationObserver === "function") {
    const layoutObserver = new MutationObserver(schedule);
    layoutObserver.observe(bar, {
      attributes: true,
      attributeFilter: ["disabled", "hidden", "style"],
      childList: true,
      subtree: true,
    });
  }
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(bar);
    resizeObserver.observe(scrollWindow);
  } else {
    view.addEventListener("resize", schedule, { passive: true });
  }
  schedule();
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

function syncControlBar(bar, scrollZone, scrollWindow, indicator) {
  const volumeGroup = bar.querySelector(".player-volume-group");
  const isVerticalPopupOpen = volumeGroup?.classList.contains("is-volume-slider-open")
    && volumeGroup.dataset.volumeSliderLayout === "vertical"
    && VOLUME_VERTICAL_DENSITIES.has(bar.dataset.controlDensity);
  if (isVerticalPopupOpen) {
    // La apertura del popup cambia su propia caja durante la transicion. No
    // usar ese cambio como motivo para recalcular la fila y cerrar el popup.
    syncScrollIndicator(scrollZone, scrollWindow, indicator);
    return;
  }

  let selectedDensity = DENSITIES[DENSITIES.length - 1];
  for (const density of DENSITIES) {
    applyControlDensity(bar, density);
    if (density === "scroll" || canFitControlStage(bar, scrollWindow)) {
      selectedDensity = density;
      break;
    }
  }
  applyControlDensity(bar, selectedDensity);
  syncScrollIndicator(scrollZone, scrollWindow, indicator);
}

function applyControlDensity(bar, density) {
  bar.dataset.controlDensity = density;
  const volumeGroup = bar.querySelector(".player-volume-group");
  if (!volumeGroup) return;

  const nextLayout = VOLUME_VERTICAL_DENSITIES.has(density) ? "vertical" : "horizontal";
  if (volumeGroup.dataset.volumeSliderLayout === nextLayout) return;
  volumeGroup.dataset.volumeSliderLayout = nextLayout;

  // El cambio de orientacion es atomico: nunca debe quedar abierta la
  // representacion anterior mientras la nueva esta siendo medida.
  if (nextLayout === "horizontal") {
    volumeGroup.classList.remove("is-volume-slider-open");
    volumeGroup.querySelector(".video-control-button")?.setAttribute("aria-expanded", "false");
  }
}

function canFitControlStage(bar, scrollWindow) {
  if (isBarOverflowing(bar) || hasStableTrackOverflow(scrollWindow)) return false;
  if (["comfortable", "close"].includes(bar.dataset.controlDensity)) {
    return canFitHorizontalVolume(bar, scrollWindow);
  }
  return true;
}

function canFitHorizontalVolume(bar, scrollWindow) {
  const group = bar.querySelector(".player-volume-group");
  const input = group?.querySelector(".player-volume-input");
  const wrap = group?.querySelector(".player-volume-slider-wrap");
  if (!group || !input || !wrap) return true;

  const inputWidth = Number.parseFloat(getComputedStyle(input).width) || 60;
  const wrapWidth = Number.parseFloat(getComputedStyle(wrap).width) || inputWidth;
  const sliderWidth = Math.max(inputWidth, wrapWidth);
  const controlGap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
  const volumeButton = group.querySelector(".video-control-button");
  const groupWidth = group.getBoundingClientRect().width;
  const buttonWidth = volumeButton?.getBoundingClientRect().width || 0;
  const currentVolumeExtra = Math.max(0, groupWidth - buttonWidth);
  const desiredVolumeExtra = sliderWidth + controlGap;
  const volumeExtraWidth = Math.max(0, desiredVolumeExtra - currentVolumeExtra);
  const metrics = getStableTrackMetrics(scrollWindow);

  return metrics.availableWidth - volumeExtraWidth >= metrics.requiredWidth - 1;
}

function hasStableTrackOverflow(scrollWindow) {
  const metrics = getStableTrackMetrics(scrollWindow);
  return metrics.requiredWidth - metrics.availableWidth > 1;
}

function getStableTrackMetrics(scrollWindow) {
  const track = scrollWindow.querySelector(".player-controls-scroll-track");
  if (!track) return { requiredWidth: 0, availableWidth: scrollWindow.clientWidth };

  const trackStyles = getComputedStyle(track);
  const trackGap = Number.parseFloat(trackStyles.columnGap) || 0;
  const trackChildren = [...track.children].filter((child) => !child.hidden);
  const requiredWidth = trackChildren.reduce((total, child) => {
    const currentWidth = child.getBoundingClientRect().width;
    const reservedWidth = Number.parseFloat(
      getComputedStyle(child).getPropertyValue("--player-rate-layout-width"),
    ) || 0;
    return total + Math.max(currentWidth, reservedWidth);
  }, 0) + Math.max(0, trackChildren.length - 1) * trackGap;

  const rateSelect = track.querySelector(".player-rate-select");
  const currentRateWidth = rateSelect?.getBoundingClientRect().width || 0;
  const reservedRateWidth = rateSelect
    ? Number.parseFloat(getComputedStyle(rateSelect).getPropertyValue("--player-rate-layout-width")) || 0
    : 0;
  const rateTransitionExtra = Math.max(0, reservedRateWidth - currentRateWidth);

  return {
    requiredWidth,
    availableWidth: Math.max(0, scrollWindow.clientWidth - rateTransitionExtra),
  };
}

function isBarOverflowing(bar) {
  const barRect = bar.getBoundingClientRect();
  return Array.from(bar.children)
    .filter((child) => !child.hidden && getComputedStyle(child).position !== "absolute")
    .some((child) => {
      const rect = child.getBoundingClientRect();
      return rect.left < barRect.left - 1 || rect.right > barRect.right + 1;
    });
}

function syncScrollIndicator(scrollZone, scrollWindow, indicator) {
  const maxScroll = Math.max(0, scrollWindow.scrollWidth - scrollWindow.clientWidth);
  const isScrollable = maxScroll > 1;
  indicator.max = String(Math.ceil(maxScroll));
  indicator.hidden = !isScrollable;
  scrollZone.classList.toggle("is-scrollable", isScrollable);
  if (!isScrollable) {
    scrollWindow.scrollLeft = 0;
    indicator.value = "0";
    indicator.setAttribute("aria-valuetext", "Todos los controles visibles");
    return;
  }
  const position = Math.min(maxScroll, Math.max(0, scrollWindow.scrollLeft));
  indicator.value = String(Math.round(position));
  indicator.setAttribute(
    "aria-valuetext",
    `${Math.round((position / maxScroll) * 100)}% de los controles visibles`,
  );
}

function handleScrollWheel(event, scrollWindow) {
  const maxScroll = scrollWindow.scrollWidth - scrollWindow.clientWidth;
  if (maxScroll <= 1) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  scrollWindow.scrollLeft += delta;
}

function handleScrollKeydown(event, scrollWindow) {
  const maxScroll = scrollWindow.scrollWidth - scrollWindow.clientWidth;
  if (maxScroll <= 1) return;
  const step = Math.max(24, Math.round(scrollWindow.clientWidth * 0.65));
  let nextPosition = null;
  if (event.key === "ArrowRight" || event.key === "PageDown") nextPosition = scrollWindow.scrollLeft + step;
  if (event.key === "ArrowLeft" || event.key === "PageUp") nextPosition = scrollWindow.scrollLeft - step;
  if (event.key === "Home") nextPosition = 0;
  if (event.key === "End") nextPosition = maxScroll;
  if (nextPosition === null) return;
  event.preventDefault();
  scrollWindow.scrollLeft = Math.min(maxScroll, Math.max(0, nextPosition));
}

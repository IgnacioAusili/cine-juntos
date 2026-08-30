import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;

function getViewportMetrics() {
  const viewport = window.visualViewport;
  return {
    width: Math.round(
      viewport?.width ||
        window.innerWidth ||
        document.documentElement.clientWidth ||
        0,
    ),
    height: Math.round(
      viewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0,
    ),
    offsetLeft: Math.round(viewport?.offsetLeft || 0),
    offsetTop: Math.round(viewport?.offsetTop || 0),
  };
}

function syncViewportMetrics() {
  const metrics = getViewportMetrics();
  document.documentElement.classList.toggle(
    "viewport-landscape",
    metrics.width > metrics.height,
  );
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--app-viewport-width", `${metrics.width}px`);
  rootStyle.setProperty("--app-viewport-height", `${metrics.height}px`);
  rootStyle.setProperty("--app-viewport-offset-left", `${metrics.offsetLeft}px`);
  rootStyle.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
}

function syncSessionToolbarHeight() {
  const height = Math.round(dom.sessionToolbar?.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty("--session-toolbar-height", `${height}px`);
}

function syncLayoutMetrics() {
  syncViewportMetrics();
  syncSessionToolbarHeight();
}

function scheduleLayoutMetricsSync() {
  if (syncFrameId) return;

  syncFrameId = window.requestAnimationFrame(() => {
    syncFrameId = 0;
    syncLayoutMetrics();
  });
}

export function wireLayoutMetrics() {
  syncLayoutMetrics();

  window.addEventListener("resize", scheduleLayoutMetricsSync, {
    passive: true,
  });
  window.addEventListener("orientationchange", scheduleLayoutMetricsSync, {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    scheduleLayoutMetricsSync,
    { passive: true },
  );
  window.visualViewport?.addEventListener(
    "scroll",
    scheduleLayoutMetricsSync,
    { passive: true },
  );

  if ("ResizeObserver" in window && dom.sessionToolbar) {
    toolbarObserver?.disconnect?.();
    toolbarObserver = new ResizeObserver(scheduleLayoutMetricsSync);
    toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
}

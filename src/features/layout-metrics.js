import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;

function getViewportHeight() {
  return Math.round(
    window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      0,
  );
}

function syncViewportHeight() {
  document.documentElement.style.setProperty("--app-viewport-height", `${getViewportHeight()}px`);
}

function syncSessionToolbarHeight() {
  const height = Math.round(dom.sessionToolbar?.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty("--session-toolbar-height", `${height}px`);
}

function syncLayoutMetrics() {
  syncViewportHeight();
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

  if ("ResizeObserver" in window && dom.sessionToolbar) {
    toolbarObserver?.disconnect?.();
    toolbarObserver = new ResizeObserver(scheduleLayoutMetricsSync);
    toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
}

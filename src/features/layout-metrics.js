import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;
let lastViewportMetrics = null;

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

function getViewportMetrics() {
  const viewport = window.visualViewport;
  // La altura del viewport visual cambia cuando el navegador móvil oculta o
  // muestra sus barras durante un swipe. No usarla para el tamaño estructural
  // de la página: si cambia mientras se desplaza, el document.scrollHeight
  // crece debajo del dedo y el scroll termina en una posición intermedia.
  const layoutWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const metrics = {
    width: Math.round(
      layoutWidth || viewport?.width || 0,
    ),
    height: Math.round(
      layoutHeight || viewport?.height || 0,
    ),
    offsetLeft: Math.round(viewport?.offsetLeft || 0),
    offsetTop: Math.round(viewport?.offsetTop || 0),
  };

  // El teclado del overlay se superpone al reproductor. Mantener las últimas
  // métricas completas evita que el visualViewport reducido refluya toda la
  // sesión o que una pantalla vertical sea interpretada como apaisada.
  if (isOverlayChatInputFocused() && lastViewportMetrics) {
    return lastViewportMetrics;
  }

  return metrics;
}

function syncViewportMetrics() {
  const metrics = getViewportMetrics();
  if (!isOverlayChatInputFocused()) lastViewportMetrics = metrics;
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
  if ("ResizeObserver" in window && dom.sessionToolbar) {
    toolbarObserver?.disconnect?.();
    toolbarObserver = new ResizeObserver(scheduleLayoutMetricsSync);
    toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
}

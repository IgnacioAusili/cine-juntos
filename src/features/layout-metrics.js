import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;
let bodyObserver = null;
let lastViewportMetrics = null;
let lockedMobileViewportMetrics = null;
let forceViewportSync = false;

const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

function getViewportMetrics() {
  const viewport = window.visualViewport;
  const documentElement = document.documentElement;
  // La altura del viewport visual cambia cuando el navegador móvil oculta o
  // muestra sus barras durante un swipe. No usarla para el tamaño estructural
  // de la página: si cambia mientras se desplaza, el document.scrollHeight
  // crece debajo del dedo y el scroll termina en una posición intermedia.
  // clientWidth/clientHeight representan el viewport CSS del documento. En
  // algunas versiones de Chrome Android innerWidth/innerHeight pueden quedar
  // expresados en la escala interna del navegador y estirar toda la sesión.
  const layoutWidth = documentElement.clientWidth
    || window.innerWidth
    || viewport?.width
    || 0;
  const layoutHeight = documentElement.clientHeight
    || window.innerHeight
    || viewport?.height
    || 0;
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

function isMobileLayout() {
  return window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches === true;
}

function isFullscreenActive() {
  return Boolean(document.fullscreenElement)
    || document.body.classList.contains("fullscreen-mode");
}

function getStableViewportMetrics(force = false) {
  const liveMetrics = getViewportMetrics();
  const shouldLock = isMobileLayout() && !isFullscreenActive();

  if (!shouldLock) {
    lockedMobileViewportMetrics = null;
    return liveMetrics;
  }

  // El alto puede variar cuando Chrome anima sus barras durante un swipe. El
  // ancho sí cambia al rotar o al redimensionar realmente el viewport.
  if (
    force
    || !lockedMobileViewportMetrics
    || liveMetrics.width !== lockedMobileViewportMetrics.width
  ) {
    lockedMobileViewportMetrics = liveMetrics;
  }

  return lockedMobileViewportMetrics;
}

function syncViewportMetrics(force = false) {
  const metrics = getStableViewportMetrics(force);
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

function syncLayoutMetrics(forceViewport = false) {
  syncViewportMetrics(forceViewport);
  syncSessionToolbarHeight();
}

function scheduleLayoutMetricsSync(forceViewport = false) {
  if (forceViewport === true) forceViewportSync = true;
  if (syncFrameId) return;

  syncFrameId = window.requestAnimationFrame(() => {
    syncFrameId = 0;
    const shouldForce = forceViewportSync;
    forceViewportSync = false;
    syncLayoutMetrics(shouldForce);
  });
}

export function wireLayoutMetrics() {
  syncLayoutMetrics();

  window.addEventListener("resize", scheduleLayoutMetricsSync, {
    passive: true,
  });
  window.addEventListener("orientationchange", () => scheduleLayoutMetricsSync(true), {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    scheduleLayoutMetricsSync,
    { passive: true },
  );
  document.addEventListener("fullscreenchange", () => scheduleLayoutMetricsSync(true));
  if ("MutationObserver" in window && document.body) {
    bodyObserver?.disconnect?.();
    bodyObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "class")) {
        scheduleLayoutMetricsSync(true);
      }
    });
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  if ("ResizeObserver" in window && dom.sessionToolbar) {
    toolbarObserver?.disconnect?.();
    toolbarObserver = new ResizeObserver(scheduleLayoutMetricsSync);
    toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
}

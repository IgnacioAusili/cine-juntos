import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;
let bodyObserver = null;
let lastViewportMetrics = null;
let lockedMobileViewportMetrics = null;
let forceViewportSync = false;
let lastNativePageScrollMax = 0;
let lastNativePageScrollTop = 0;
let pageBottomRestoreTimer = 0;

const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

function measureViewportUnit(unit) {
  if (!document.body || !window.CSS?.supports?.("height", `100${unit}`)) return 0;

  const probe = document.createElement("div");
  probe.style.cssText = [
    "position: fixed",
    "inset: 0 auto auto 0",
    "width: 0",
    `height: 100${unit}`,
    "visibility: hidden",
    "pointer-events: none",
  ].join(";");
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

function getLargeViewportHeight() {
  return measureViewportUnit("lvh")
    || document.documentElement.clientHeight
    || window.innerHeight
    || window.visualViewport?.height
    || 0;
}

function getNativePageScrollMax() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function rememberNativePageScrollPosition() {
  lastNativePageScrollMax = getNativePageScrollMax();
  lastNativePageScrollTop = window.scrollY || 0;
}

function preservePageBottomAfterViewportChange() {
  if (!isMobileLayout() || isFullscreenActive()) {
    rememberNativePageScrollPosition();
    return;
  }

  const previousMax = lastNativePageScrollMax;
  const previousTop = lastNativePageScrollTop;
  const wasAtBottom = previousMax > 4 && previousTop >= previousMax - 6;
  rememberNativePageScrollPosition();
  if (!wasAtBottom) return;

  if (pageBottomRestoreTimer) window.clearTimeout(pageBottomRestoreTimer);
  pageBottomRestoreTimer = window.setTimeout(() => {
    pageBottomRestoreTimer = 0;
    const currentMax = getNativePageScrollMax();
    // Si el dedo ya produjo otro desplazamiento, respetar ese gesto. Solo
    // corregir el borde cuando el viewport cambió sin que el usuario se
    // alejara de la posición en la que ya estaba abajo.
    if (Math.abs((window.scrollY || 0) - previousTop) > 8) {
      rememberNativePageScrollPosition();
      return;
    }
    if (currentMax > previousMax + 1) {
      window.scrollTo({ top: currentMax, behavior: "auto" });
    }
    rememberNativePageScrollPosition();
  }, 80);
}

function getViewportMetrics() {
  const viewport = window.visualViewport;
  const documentElement = document.documentElement;
  // La altura del viewport visual cambia cuando el navegador móvil oculta o
  // muestra sus barras durante un swipe. No usarla para el tamaño estructural
  // de la página: si cambia mientras se desplaza, el document.scrollHeight
  // crece debajo del dedo y el scroll termina en una posición intermedia.
  // clientWidth representa el ancho CSS del documento. Para la altura usamos
  // lvh (large viewport height): es el alto completo que queda disponible con
  // las barras de Chrome ocultas y no cambia cuando esas barras aparecen o se
  // esconden durante un swipe. innerHeight/visualViewport son dinámicos y no
  // deben dimensionar el workspace.
  const layoutWidth = documentElement.clientWidth
    || window.innerWidth
    || viewport?.width
    || 0;
  const layoutHeight = getLargeViewportHeight()
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
  const liveMetrics = getViewportMetrics(force);
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
  const rootStyle = document.documentElement.style;
  const previousHeight = Number.parseFloat(
    rootStyle.getPropertyValue("--app-viewport-height"),
  );
  const previousMaxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  const wasAtPageBottom = previousMaxScroll > 4
    && window.scrollY >= previousMaxScroll - 4;
  const metrics = getStableViewportMetrics(force);
  if (!isOverlayChatInputFocused()) lastViewportMetrics = metrics;
  document.documentElement.classList.toggle(
    "viewport-landscape",
    metrics.width > metrics.height,
  );
  rootStyle.setProperty("--app-viewport-width", `${metrics.width}px`);
  rootStyle.setProperty("--app-viewport-height", `${metrics.height}px`);
  rootStyle.setProperty("--app-viewport-offset-left", `${metrics.offsetLeft}px`);
  rootStyle.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);

  // Un cambio real de orientación/ancho puede alterar la altura estructural.
  // Si ya estábamos abajo, el nuevo alto aumenta el documento y hay que
  // conservar el borde inferior para no dejar el formulario cortado. Los
  // resize que solo animan las barras de Chrome no llegan aquí con force.
  if (
    force
    && isMobileLayout()
    && !isFullscreenActive()
    && Number.isFinite(previousHeight)
    && previousHeight !== metrics.height
    && wasAtPageBottom
  ) {
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
        behavior: "auto",
      });
    });
  }
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
  rememberNativePageScrollPosition();

  window.addEventListener("scroll", rememberNativePageScrollPosition, {
    passive: true,
  });

  window.addEventListener("resize", () => {
    const viewportWidth = Math.round(
      window.visualViewport?.width
      || window.innerWidth
      || document.documentElement.clientWidth
      || 0,
    );
    const referenceWidth = lockedMobileViewportMetrics?.width
      || lastViewportMetrics?.width
      || 0;
    const widthChanged = Boolean(
      viewportWidth
      && referenceWidth
      && viewportWidth !== referenceWidth,
    );

    // Chrome Android también emite resize cuando solo anima sus barras. En
    // ese caso innerHeight cambia, pero el viewport estructural y el ancho no:
    // recalcularlo agranda/achica el reproductor durante el scroll. La altura
    // solo se vuelve a tomar en un cambio real de ancho/orientación.
    preservePageBottomAfterViewportChange();
    scheduleLayoutMetricsSync(!isMobileLayout() || widthChanged);
  }, {
    passive: true,
  });
  window.addEventListener("orientationchange", () => scheduleLayoutMetricsSync(true), {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    () => {
      const viewportWidth = Math.round(window.visualViewport?.width || 0);
      const widthChanged = Boolean(
        viewportWidth
        && lockedMobileViewportMetrics
        && viewportWidth !== lockedMobileViewportMetrics.width,
      );
      preservePageBottomAfterViewportChange();
      scheduleLayoutMetricsSync(widthChanged);
    },
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

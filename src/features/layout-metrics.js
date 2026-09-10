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
let bottomChatScrollBeforeKeyboard = null;
let bottomChatPageScrollLockTop = null;
let wasBottomChatKeyboardOpen = false;
let bottomChatKeyboardHandleAnchor = null;
let fullscreenMetricResyncTimers = [];
let lastFullscreenActive = false;

const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

function isBottomChatInputFocused() {
  return document.activeElement === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "bottom";
}

function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains("bottom-chat-keyboard-open");
}

function captureBottomChatKeyboardHandlePosition() {
  const handleZone = dom.collapseChatButton?.closest(".chat-collapse-hover-zone");
  if (
    !handleZone
    || !isMobileLayout()
    || dom.sessionView?.dataset.chatDock !== "bottom"
    || bottomChatKeyboardHandleAnchor?.handleZone === handleZone
  ) return;

  const rect = handleZone.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const positioningParent = handleZone.offsetParent || dom.workspace;
  const positioningParentRect = positioningParent?.getBoundingClientRect();
  if (!positioningParentRect) return;

  const properties = ["position", "top", "right", "bottom", "left", "transform", "transition"];
  bottomChatKeyboardHandleAnchor = {
    handleZone,
    positioningParent,
    initialTop: rect.top + rect.height / 2 - positioningParentRect.top,
    inlineStyles: Object.fromEntries(
      properties.map((property) => [
        property,
        {
          value: handleZone.style.getPropertyValue(property),
          priority: handleZone.style.getPropertyPriority(property),
        },
      ]),
    ),
  };

  // El handle vive dentro de un contexto de posicionamiento propio. Usar
  // absolute y expresar el top relativo a su offsetParent evita que un fixed
  // se teletransporte al borde del header cuando el contenedor tiene transform.
  handleZone.style.setProperty("position", "absolute");
  handleZone.style.setProperty("top", `${bottomChatKeyboardHandleAnchor.initialTop}px`);
  handleZone.style.setProperty("right", "auto");
  handleZone.style.setProperty("bottom", "auto");
  handleZone.style.setProperty("left", "50%");
  handleZone.style.setProperty("transform", "translate(-50%, -50%)");
  handleZone.style.setProperty(
    "transition",
    "top 180ms ease, opacity 160ms ease, color 160ms ease, background 160ms ease",
  );
}

function restoreBottomChatKeyboardHandlePosition() {
  const anchor = bottomChatKeyboardHandleAnchor;
  bottomChatKeyboardHandleAnchor = null;
  if (!anchor?.handleZone) return;

  Object.entries(anchor.inlineStyles).forEach(([property, inlineStyle]) => {
    if (inlineStyle.value) {
      anchor.handleZone.style.setProperty(property, inlineStyle.value, inlineStyle.priority);
    } else {
      anchor.handleZone.style.removeProperty(property);
    }
  });
}

function isBottomChatScrollableTarget(target) {
  return target instanceof Element
    && Boolean(target.closest([
      ".session-view[data-chat-dock=\"bottom\"] .messages",
      ".session-view[data-chat-dock=\"bottom\"] .chat-scrollbar",
      ".session-view[data-chat-dock=\"bottom\"] textarea",
    ].join(",")));
}

function preventBottomChatPageScroll(event) {
  if (!isBottomChatKeyboardOpen() || isBottomChatScrollableTarget(event.target)) return;
  event.preventDefault();
}

function restoreBottomChatPageScrollPosition() {
  if (!isBottomChatKeyboardOpen() || !Number.isFinite(bottomChatPageScrollLockTop)) return;

  const currentTop = window.scrollY || 0;
  if (Math.abs(currentTop - bottomChatPageScrollLockTop) > 1) {
    window.scrollTo({ top: bottomChatPageScrollLockTop, behavior: "auto" });
  }
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

function getCurrentViewportHeight() {
  return Math.round(
    document.documentElement.clientHeight
      || window.innerHeight
      || window.visualViewport?.height
      || 0,
  );
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

function getViewportMetrics(force = false) {
  const viewport = window.visualViewport;
  const documentElement = document.documentElement;
  const currentViewportHeight = getCurrentViewportHeight();
  const hasReducedViewport = !force && Boolean(
    lastViewportMetrics?.height
      && currentViewportHeight > 0
      && currentViewportHeight < lastViewportMetrics.height - 80,
  );
  // Una sincronización forzada también debe poder descartar una altura vieja
  // que haya quedado después de salir de fullscreen. La altura del viewport visual cambia cuando el navegador móvil oculta o
  // muestra sus barras durante un swipe. No usarla para el tamaño estructural
  // de la página: si cambia mientras se desplaza, el document.scrollHeight
  // crece debajo del dedo y el scroll termina en una posición intermedia.
  // clientWidth representa el ancho CSS del documento. Para la altura usamos
  // lvh (large viewport height): conserva el alto del viewport cuando las
  // barras de Chrome están ocultas, incluso mientras siguen visibles. Así el
  // workspace no cambia de tamaño al iniciar un swipe. innerHeight y
  // visualViewport solo se usan para el ajuste específico del teclado.
  const layoutWidth = documentElement.clientWidth
    || window.innerWidth
    || viewport?.width
    || 0;
  const layoutHeight = (hasReducedViewport && lastViewportMetrics?.height)
    || getLargeViewportHeight()
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
  // sesión o que una pantalla vertical sea interpretada como apaisada. El
  // chat inferior es la excepción: con interactive-widget=resizes-content
  // necesita aceptar el alto reducido para que el composer siga al teclado.
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

function scheduleFullscreenMetricResync() {
  fullscreenMetricResyncTimers.forEach((timer) => window.clearTimeout(timer));
  fullscreenMetricResyncTimers = [];
  lastViewportMetrics = null;
  lockedMobileViewportMetrics = null;

  [0, 80, 180, 360, 700].forEach((delay) => {
    const timer = window.setTimeout(() => {
      fullscreenMetricResyncTimers = fullscreenMetricResyncTimers.filter(
        (activeTimer) => activeTimer !== timer,
      );
      lastViewportMetrics = null;
      lockedMobileViewportMetrics = null;
      scheduleLayoutMetricsSync(true);
    }, delay);
    fullscreenMetricResyncTimers.push(timer);
  });
}

function getStableViewportMetrics(force = false) {
  const liveMetrics = getViewportMetrics(force);
  const shouldLock = isMobileLayout()
    && !isFullscreenActive()
    && !isBottomChatInputFocused();

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
  const currentViewportHeight = getCurrentViewportHeight();
  const bottomChatKeyboardOpen = isBottomChatInputFocused()
    && currentViewportHeight > 0
    && metrics.height - currentViewportHeight > 80;
  if (!isOverlayChatInputFocused() && !isBottomChatInputFocused()) {
    lastViewportMetrics = metrics;
  }
  document.documentElement.classList.toggle(
    "viewport-landscape",
    metrics.width > metrics.height,
  );
  rootStyle.setProperty("--app-viewport-width", `${metrics.width}px`);
  rootStyle.setProperty("--app-viewport-height", `${metrics.height}px`);
  rootStyle.setProperty(
    "--chat-bottom-viewport-height",
    `${currentViewportHeight || metrics.height}px`,
  );
  syncBottomChatVisibleHeight(currentViewportHeight);
  rootStyle.setProperty("--app-viewport-offset-left", `${metrics.offsetLeft}px`);
  rootStyle.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
  if (bottomChatKeyboardOpen && !wasBottomChatKeyboardOpen) {
    bottomChatScrollBeforeKeyboard = window.scrollY;
    bottomChatPageScrollLockTop = null;
    captureBottomChatKeyboardHandlePosition();
  }
  document.documentElement.classList.toggle(
    "bottom-chat-keyboard-open",
    bottomChatKeyboardOpen,
  );
  if (bottomChatKeyboardOpen) {
    window.requestAnimationFrame(() => {
      alignBottomChatKeyboardViewport();
      if (bottomChatPageScrollLockTop === null) {
        bottomChatPageScrollLockTop = window.scrollY || 0;
      }
      window.setTimeout(() => {
        alignBottomChatKeyboardViewport();
      }, 50);
    });
  } else if (wasBottomChatKeyboardOpen) {
    bottomChatPageScrollLockTop = null;
    restoreBottomChatKeyboardHandlePosition();
    if (isBottomChatInputFocused()) {
      dom.messageInput.blur();
    }
    window.requestAnimationFrame(() => {
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );
      const targetScroll = Math.min(
        bottomChatScrollBeforeKeyboard ?? maxScroll,
        maxScroll,
      );
      window.scrollTo({ top: targetScroll, behavior: "auto" });
      bottomChatScrollBeforeKeyboard = null;
      rememberNativePageScrollPosition();
    });
  }
  wasBottomChatKeyboardOpen = bottomChatKeyboardOpen;

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

function syncBottomChatVisibleHeight(viewportHeight) {
  if (!dom.chatArea || !viewportHeight) return;

  const chatRect = dom.chatArea.getBoundingClientRect();
  const availableChatHeight = Math.max(0, viewportHeight - chatRect.top);
  document.documentElement.style.setProperty(
    "--chat-bottom-visible-height",
    `${availableChatHeight}px`,
  );
}

function alignBottomChatKeyboardViewport() {
  if (!dom.workspace || !isBottomChatInputFocused()) return;

  const workspaceTop = dom.workspace.getBoundingClientRect().top + window.scrollY;
  const targetTop = bottomChatPageScrollLockTop ?? Math.max(0, workspaceTop);
  if (Math.abs(window.scrollY - targetTop) > 1) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
  }
  syncBottomChatVisibleHeight(getCurrentViewportHeight());

  const anchoredHandleZone = bottomChatKeyboardHandleAnchor?.handleZone;
  const videoRect = dom.videoArea?.getBoundingClientRect();
  const chatRect = dom.chatArea?.getBoundingClientRect();
  if (anchoredHandleZone && chatRect && (videoRect?.height > 0 || isBottomChatKeyboardOpen())) {
    // Cuando el IME colapsa el video, la unión pasa a ser el borde superior
    // del chat. Mantener el centro dentro del workspace evita que la flecha
    // conserve el top anterior y desaparezca fuera del viewport reducido.
    const positioningParent = anchoredHandleZone.offsetParent || dom.workspace;
    const positioningParentRect = positioningParent?.getBoundingClientRect();
    if (!positioningParentRect) return;
    const handleHeight = anchoredHandleZone.getBoundingClientRect().height
      || anchoredHandleZone.offsetHeight;
    const halfHandle = handleHeight / 2;
    const boundaryTop = videoRect?.height > 0
      ? videoRect.bottom
      : chatRect.top;
    const desiredCenter = boundaryTop - positioningParentRect.top
      + (videoRect?.height > 0 ? 0 : halfHandle);
    const minCenter = halfHandle;
    const maxCenter = Math.max(minCenter, positioningParentRect.height - halfHandle);
    const boundedCenter = Math.min(maxCenter, Math.max(minCenter, desiredCenter));
    if (document.documentElement.classList.contains("viewport-landscape")) {
      // El reanclaje acompaña el cambio de viewport del IME; no debe verse
      // como un salto animado desde la posición previa del video.
      anchoredHandleZone.style.setProperty("transition", "none");
    }
    anchoredHandleZone.style.setProperty(
      "top",
      `${boundedCenter}px`,
    );
    anchoredHandleZone.style.setProperty("bottom", "auto");
  }
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
  window.addEventListener("scroll", restoreBottomChatPageScrollPosition, {
    passive: true,
  });
  document.addEventListener("touchmove", preventBottomChatPageScroll, {
    capture: true,
    passive: false,
  });
  document.addEventListener("wheel", preventBottomChatPageScroll, {
    capture: true,
    passive: false,
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
    if (!isBottomChatInputFocused()) preservePageBottomAfterViewportChange();
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
      if (!isBottomChatInputFocused()) preservePageBottomAfterViewportChange();
      scheduleLayoutMetricsSync(widthChanged);
    },
    { passive: true },
  );
  lastFullscreenActive = isFullscreenActive();
  document.addEventListener("fullscreenchange", scheduleFullscreenMetricResync);
  document.addEventListener("pointerdown", (event) => {
    if (event.target === dom.messageInput) {
      // pointerdown ocurre antes de focusin y antes de que el header se
      // contraiga. Capturar aquí evita usar como origen una posición
      // intermedia del reflow del chat.
      captureBottomChatKeyboardHandlePosition();
    }
  }, { capture: true, passive: true });
  document.addEventListener("focusin", (event) => {
    if (event.target === dom.messageInput) {
      // Preparar el anclaje antes de que Chrome reduzca el viewport evita que
      // la flecha permanezca un instante en su posición vieja.
      captureBottomChatKeyboardHandlePosition();
      scheduleLayoutMetricsSync();
    }
  }, { passive: true });
  document.addEventListener("focusout", (event) => {
    if (event.target === dom.messageInput) {
      scheduleLayoutMetricsSync();
      if (!isBottomChatKeyboardOpen() && !wasBottomChatKeyboardOpen) {
        window.setTimeout(() => {
          if (!isBottomChatKeyboardOpen() && !wasBottomChatKeyboardOpen) {
            restoreBottomChatKeyboardHandlePosition();
          }
        }, 140);
      }
    }
  }, { passive: true });
  if ("MutationObserver" in window && document.body) {
    bodyObserver?.disconnect?.();
    bodyObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "class")) {
        const fullscreenActive = isFullscreenActive();
        if (fullscreenActive !== lastFullscreenActive) {
          lastFullscreenActive = fullscreenActive;
          scheduleFullscreenMetricResync();
          return;
        }
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

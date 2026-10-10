import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { layoutMetricsState } from "./layout-metrics-state.js?v=20261010-file-size-refactor-02";
import { isOverlayChatInputFocused, isBottomChatKeyboardTarget, isBottomChatNameEditorFocused, isBottomChatInputFocused, isBottomChatKeyboardOpen, isRightChatInputFocused, isRightChatKeyboardOpen, captureRightChatKeyboardScroll, alignRightChatKeyboardViewport, restoreRightChatKeyboardScroll, preventRightChatPageScroll, captureBottomChatKeyboardHandlePosition, restoreBottomChatKeyboardHandlePosition, preventBottomChatPageScroll, restoreBottomChatPageScrollPosition, getLargeViewportHeight, getCurrentViewportHeight, getNativePageScrollMax, captureOrientationScrollPosition, restoreOrientationScrollPosition, scheduleOrientationScrollRestore, rememberNativePageScrollPosition, preservePageBottomAfterViewportChange } from "./layout-viewport-interactions.js?v=20261010-file-size-refactor-02";
import { isMobileLayout, isFullscreenActive } from "./layout-viewport-query.js?v=20261010-file-size-refactor-02";

export { isMobileLayout, isFullscreenActive } from "./layout-viewport-query.js?v=20261010-file-size-refactor-02";

export function getViewportMetrics(force = false) {
  const viewport = window.visualViewport;
  const documentElement = document.documentElement;
  const currentViewportHeight = getCurrentViewportHeight();
  const rightChatKeyboardOpen = isRightChatKeyboardOpen(currentViewportHeight);
  const hasReducedViewport = !force && Boolean(
    layoutMetricsState.lastViewportMetrics?.height
      && currentViewportHeight > 0
      && currentViewportHeight < layoutMetricsState.lastViewportMetrics.height - 80,
  );
  const fullscreenActive = isFullscreenActive();
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
  const layoutHeight = rightChatKeyboardOpen || fullscreenActive
    ? currentViewportHeight
    : (hasReducedViewport && layoutMetricsState.lastViewportMetrics?.height)
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
  if (isOverlayChatInputFocused() && layoutMetricsState.lastViewportMetrics) {
    return layoutMetricsState.lastViewportMetrics;
  }

  return metrics;
}

function isViewportLandscape(metrics, rightChatKeyboardOpen) {
  if (!rightChatKeyboardOpen || !layoutMetricsState.lastViewportMetrics) {
    return metrics.width > metrics.height;
  }

  // El teclado reduce el viewport visible, pero no cambia la orientación del
  // dispositivo. Mientras el ancho siga siendo el mismo, conservar la última
  // métrica completa evita que una pantalla vertical active las reglas de
  // landscape y vuelva a poner video y chat en columnas. Si el ancho cambió,
  // sí hay una rotación real y las métricas actuales vuelven a ser la fuente.
  const widthChanged = Math.abs(metrics.width - layoutMetricsState.lastViewportMetrics.width) > 1;
  return (widthChanged ? metrics : layoutMetricsState.lastViewportMetrics).width
    > (widthChanged ? metrics : layoutMetricsState.lastViewportMetrics).height;
}

export function scheduleFullscreenMetricResync() {
  layoutMetricsState.fullscreenMetricResyncTimers.forEach((timer) => window.clearTimeout(timer));
  layoutMetricsState.fullscreenMetricResyncTimers = [];
  layoutMetricsState.lastViewportMetrics = null;
  layoutMetricsState.lockedMobileViewportMetrics = null;

  [0, 80, 180, 360, 700].forEach((delay) => {
    const timer = window.setTimeout(() => {
      layoutMetricsState.fullscreenMetricResyncTimers = layoutMetricsState.fullscreenMetricResyncTimers.filter(
        (activeTimer) => activeTimer !== timer,
      );
      layoutMetricsState.lastViewportMetrics = null;
      layoutMetricsState.lockedMobileViewportMetrics = null;
      scheduleLayoutMetricsSync(true);
    }, delay);
    layoutMetricsState.fullscreenMetricResyncTimers.push(timer);
  });
}

function getStableViewportMetrics(force = false) {
  const liveMetrics = getViewportMetrics(force);
  const shouldLock = isMobileLayout()
    && !isFullscreenActive()
    && !isBottomChatInputFocused()
    && !isRightChatKeyboardOpen();

  if (!shouldLock) {
    layoutMetricsState.lockedMobileViewportMetrics = null;
    return liveMetrics;
  }

  // El alto puede variar cuando Chrome anima sus barras durante un swipe. El
  // ancho sí cambia al rotar o al redimensionar realmente el viewport.
  if (
    force
    || !layoutMetricsState.lockedMobileViewportMetrics
    || liveMetrics.width !== layoutMetricsState.lockedMobileViewportMetrics.width
  ) {
    layoutMetricsState.lockedMobileViewportMetrics = liveMetrics;
  }

  return layoutMetricsState.lockedMobileViewportMetrics;
}

export function syncViewportMetrics(force = false) {
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
  const rightChatKeyboardOpen = isRightChatKeyboardOpen(currentViewportHeight);
  if (
    !isOverlayChatInputFocused()
    && !isBottomChatInputFocused()
    && !rightChatKeyboardOpen
  ) {
    layoutMetricsState.lastViewportMetrics = metrics;
  }
  document.documentElement.classList.toggle(
    "viewport-landscape",
    isViewportLandscape(metrics, rightChatKeyboardOpen),
  );
  rootStyle.setProperty("--app-viewport-width", `${metrics.width}px`);
  rootStyle.setProperty("--app-viewport-height", `${metrics.height}px`);
  rootStyle.setProperty(
    "--chat-bottom-viewport-height",
    `${currentViewportHeight || metrics.height}px`,
  );
  rootStyle.setProperty(
    "--right-chat-visible-height",
    `${currentViewportHeight || metrics.height}px`,
  );
  syncBottomChatVisibleHeight(currentViewportHeight);
  rootStyle.setProperty("--app-viewport-offset-left", `${metrics.offsetLeft}px`);
  rootStyle.setProperty("--app-viewport-offset-top", `${metrics.offsetTop}px`);
  if (bottomChatKeyboardOpen && !layoutMetricsState.wasBottomChatKeyboardOpen) {
    layoutMetricsState.bottomChatScrollBeforeKeyboard = window.scrollY;
    // Chrome intenta desplazar la pagina para mostrar el input enfocado. En
    // el chat inferior ese ajuste mueve el header completo; conservar el
    // scroll anterior mantiene el input y la flecha en su anclaje visual.
    layoutMetricsState.bottomChatPageScrollLockTop = isBottomChatNameEditorFocused()
      ? null
      : layoutMetricsState.bottomChatScrollBeforeKeyboard;
    captureBottomChatKeyboardHandlePosition();
  }
  document.documentElement.classList.toggle(
    "bottom-chat-keyboard-open",
    bottomChatKeyboardOpen,
  );
  if (rightChatKeyboardOpen && !layoutMetricsState.wasRightChatKeyboardOpen) {
    captureRightChatKeyboardScroll();
  }
  document.documentElement.classList.toggle(
    "right-chat-keyboard-open",
    rightChatKeyboardOpen,
  );
  if (rightChatKeyboardOpen) {
    window.requestAnimationFrame(alignRightChatKeyboardViewport);
    window.setTimeout(alignRightChatKeyboardViewport, 50);
  } else if (layoutMetricsState.wasRightChatKeyboardOpen) {
    restoreRightChatKeyboardScroll();
  }
  layoutMetricsState.wasRightChatKeyboardOpen = rightChatKeyboardOpen;
  if (bottomChatKeyboardOpen) {
    window.requestAnimationFrame(() => {
      alignBottomChatKeyboardViewport();
      if (layoutMetricsState.bottomChatPageScrollLockTop === null) {
        layoutMetricsState.bottomChatPageScrollLockTop = window.scrollY || 0;
      }
      window.setTimeout(() => {
        alignBottomChatKeyboardViewport();
      }, 50);
      window.requestAnimationFrame(() => {
        if (isBottomChatKeyboardOpen() && layoutMetricsState.bottomChatKeyboardHandleAnchor?.handleZone) {
          layoutMetricsState.bottomChatKeyboardHandleAnchor.handleZone.style.setProperty("opacity", "1");
        }
      });
    });
  } else if (layoutMetricsState.wasBottomChatKeyboardOpen) {
    layoutMetricsState.bottomChatPageScrollLockTop = null;
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
        layoutMetricsState.bottomChatScrollBeforeKeyboard ?? maxScroll,
        maxScroll,
      );
      window.scrollTo({ top: targetScroll, behavior: "auto" });
      layoutMetricsState.bottomChatScrollBeforeKeyboard = null;
      rememberNativePageScrollPosition();
    });
  }
  layoutMetricsState.wasBottomChatKeyboardOpen = bottomChatKeyboardOpen;

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

  if (force) scheduleOrientationScrollRestore();
}

export function syncSessionToolbarHeight() {
  const height = Math.round(dom.sessionToolbar?.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty("--session-toolbar-height", `${height}px`);
}

export function syncBottomChatVisibleHeight(viewportHeight) {
  if (!dom.chatArea || !viewportHeight) return;

  const chatRect = dom.chatArea.getBoundingClientRect();
  const minimumHeaderHeight = isBottomChatNameEditorFocused() ? 38 : 0;
  const availableChatHeight = Math.max(
    minimumHeaderHeight,
    viewportHeight - chatRect.top,
  );
  document.documentElement.style.setProperty(
    "--chat-bottom-visible-height",
    `${availableChatHeight}px`,
  );
}

export function alignBottomChatKeyboardViewport() {
  if (!dom.workspace || !isBottomChatInputFocused()) return;

  const workspaceTop = dom.workspace.getBoundingClientRect().top + window.scrollY;
  const targetTop = layoutMetricsState.bottomChatPageScrollLockTop ?? Math.max(0, workspaceTop);
  if (Math.abs(window.scrollY - targetTop) > 1) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
  }
  syncBottomChatVisibleHeight(getCurrentViewportHeight());

  const anchoredHandleZone = layoutMetricsState.bottomChatKeyboardHandleAnchor?.handleZone;
  const videoRect = dom.videoArea?.getBoundingClientRect();
  const chatRect = dom.chatArea?.getBoundingClientRect();
  if (anchoredHandleZone && chatRect && (videoRect?.height > 0 || isBottomChatKeyboardOpen())) {
    // Cuando el viewport del teclado colapsa el video, la unión pasa a ser
    // el borde superior del chat. Mantener el centro dentro del workspace
    // evita que la flecha conserve el top anterior y salga del viewport.
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
      // Animar la opacidad después de calcular el anclaje evita ocultar la
      // flecha durante el foco previo a un cambio real del viewport.
      anchoredHandleZone.style.setProperty(
        "transition",
        "opacity 180ms ease, color 160ms ease, background 160ms ease",
      );
    }
    anchoredHandleZone.style.setProperty(
      "top",
      `${boundedCenter}px`,
    );
    anchoredHandleZone.style.setProperty("bottom", "auto");
    if (document.documentElement.classList.contains("viewport-landscape")) {
      // Reafirmar visibilidad después del reanclaje evita que la flecha quede
      // invisible si Chrome emite varios resize al abrir el teclado.
      anchoredHandleZone.style.setProperty("opacity", "1");
    }
  }
}

export function syncLayoutMetrics(forceViewport = false) {
  syncViewportMetrics(forceViewport);
  syncSessionToolbarHeight();
}

export function scheduleLayoutMetricsSync(forceViewport = false) {
  if (forceViewport === true) layoutMetricsState.forceViewportSync = true;
  if (layoutMetricsState.syncFrameId) return;

  layoutMetricsState.syncFrameId = window.requestAnimationFrame(() => {
    layoutMetricsState.syncFrameId = 0;
    const shouldForce = layoutMetricsState.forceViewportSync;
    layoutMetricsState.forceViewportSync = false;
    syncLayoutMetrics(shouldForce);
  });
}

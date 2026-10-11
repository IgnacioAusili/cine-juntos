import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { layoutMetricsState } from "./layout-metrics-state.js?v=20261010-file-size-refactor-02";
import { isMobileLayout, isFullscreenActive, isBottomChatInputFocused, isRightChatInputFocused } from "./layout-viewport-query.js?v=20261010-file-size-refactor-02";

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

export function getLargeViewportHeight() {
  return measureViewportUnit("lvh")
    || document.documentElement.clientHeight
    || window.innerHeight
    || window.visualViewport?.height
    || 0;
}

function getMinimumUsableRightChatViewportHeight() {
  const inputHeight = Math.round(dom.messageInput?.getBoundingClientRect().height || 0);
  return Math.max(80, inputHeight * 2);
}

export function getCurrentViewportHeight() {
  const visualViewportHeight = Math.round(window.visualViewport?.height || 0);
  const visualViewportWidth = Math.round(window.visualViewport?.width || 0);
  const layoutViewportHeight = Math.round(
    document.documentElement.clientHeight
      || window.innerHeight
      || visualViewportHeight
      || 0,
  );
  const minimumUsableHeight = getMinimumUsableRightChatViewportHeight();

  // En Safari iOS el clientHeight puede seguir representando el área de
  // layout mientras el teclado ya redujo el visualViewport. Para el chat
  // lateral enfocado, esa diferencia es precisamente el espacio ocupado por
  // el teclado; usar clientHeight deja el composer debajo del IME.
  const rightChatKeyboardLikelyOpen = isRightChatInputFocused()
    && visualViewportHeight > 0
    && layoutViewportHeight - visualViewportHeight > 80;
  if (rightChatKeyboardLikelyOpen && visualViewportHeight >= minimumUsableHeight) {
    layoutMetricsState.lastRightChatKeyboardViewportHeight = visualViewportHeight;
    layoutMetricsState.lastRightChatKeyboardViewportWidth = visualViewportWidth;
    return visualViewportHeight;
  }

  // En aperturas posteriores Safari puede emitir transitoriamente un
  // visualViewport de 1-3px. Aplicarlo al layout crea un feedback loop: el
  // chat se reduce a esa altura y el input termina fuera de pantalla. Si ya
  // tenemos una medición válida de esta misma orientación, la conservamos
  // hasta que Safari entregue una nueva medición utilizable.
  const sameViewportWidth = visualViewportWidth > 0
    && layoutMetricsState.lastRightChatKeyboardViewportWidth > 0
    && Math.abs(visualViewportWidth - layoutMetricsState.lastRightChatKeyboardViewportWidth) <= 1;
  if (
    rightChatKeyboardLikelyOpen
    && visualViewportHeight < minimumUsableHeight
    && sameViewportWidth
    && layoutMetricsState.lastRightChatKeyboardViewportHeight >= minimumUsableHeight
  ) {
    return layoutMetricsState.lastRightChatKeyboardViewportHeight;
  }

  return layoutViewportHeight;
}

export function getNativePageScrollMax() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function captureOrientationScrollPosition() {
  if (
    !isMobileLayout()
    || isFullscreenActive()
    || isBottomChatInputFocused()
    || isRightChatKeyboardOpen()
    || layoutMetricsState.pendingOrientationScrollRestore
  ) return;

  const maxScroll = getNativePageScrollMax();
  const scrollTop = window.scrollY || 0;
  layoutMetricsState.pendingOrientationScrollRestore = {
    scrollTop,
    wasAtBottom: maxScroll > 4 && scrollTop >= maxScroll - 6,
  };
}

export function restoreOrientationScrollPosition() {
  const pending = layoutMetricsState.pendingOrientationScrollRestore;
  layoutMetricsState.pendingOrientationScrollRestore = null;
  layoutMetricsState.orientationScrollRestoreFrame = 0;
  if (!pending) return;

  const maxScroll = getNativePageScrollMax();
  const targetScroll = pending.wasAtBottom
    ? maxScroll
    : Math.min(pending.scrollTop, maxScroll);
  if (Math.abs((window.scrollY || 0) - targetScroll) <= 1) return;

  window.scrollTo({ top: targetScroll, behavior: "auto" });
}

export function scheduleOrientationScrollRestore() {
  if (!layoutMetricsState.pendingOrientationScrollRestore || layoutMetricsState.orientationScrollRestoreFrame) return;

  // Esperar dos frames deja que el navegador termine el reflow provocado por
  // la nueva orientación antes de calcular el máximo y restaurar el anclaje.
  layoutMetricsState.orientationScrollRestoreFrame = window.requestAnimationFrame(() => {
    layoutMetricsState.orientationScrollRestoreFrame = window.requestAnimationFrame(
      restoreOrientationScrollPosition,
    );
  });
}

export function rememberNativePageScrollPosition() {
  layoutMetricsState.lastNativePageScrollMax = getNativePageScrollMax();
  layoutMetricsState.lastNativePageScrollTop = window.scrollY || 0;
}

export function preservePageBottomAfterViewportChange() {
  if (!isMobileLayout() || isFullscreenActive()) {
    rememberNativePageScrollPosition();
    return;
  }

  const previousMax = layoutMetricsState.lastNativePageScrollMax;
  const previousTop = layoutMetricsState.lastNativePageScrollTop;
  const wasAtBottom = previousMax > 4 && previousTop >= previousMax - 6;
  rememberNativePageScrollPosition();
  if (!wasAtBottom) return;

  if (layoutMetricsState.pageBottomRestoreTimer) window.clearTimeout(layoutMetricsState.pageBottomRestoreTimer);
  layoutMetricsState.pageBottomRestoreTimer = window.setTimeout(() => {
    layoutMetricsState.pageBottomRestoreTimer = 0;
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

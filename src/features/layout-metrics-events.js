import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { layoutMetricsState } from "./layout-metrics-state.js?v=20261010-file-size-refactor-02";
import { isOverlayChatInputFocused, isBottomChatKeyboardTarget, isBottomChatNameEditorFocused, isBottomChatInputFocused, isBottomChatKeyboardOpen, isRightChatInputFocused, isRightChatKeyboardOpen, captureRightChatKeyboardScroll, alignRightChatKeyboardViewport, restoreRightChatKeyboardScroll, preventRightChatPageScroll, captureBottomChatKeyboardHandlePosition, restoreBottomChatKeyboardHandlePosition, preventBottomChatPageScroll, restoreBottomChatPageScrollPosition, getLargeViewportHeight, getCurrentViewportHeight, getNativePageScrollMax, captureOrientationScrollPosition, restoreOrientationScrollPosition, scheduleOrientationScrollRestore, rememberNativePageScrollPosition, preservePageBottomAfterViewportChange } from "./layout-viewport-interactions.js?v=20261010-file-size-refactor-02";
import { syncLayoutMetrics, scheduleLayoutMetricsSync, scheduleFullscreenMetricResync, isMobileLayout, isFullscreenActive } from "./layout-viewport-engine.js?v=20261010-file-size-refactor-02";

export function wireLayoutMetrics() {
  syncLayoutMetrics();
  rememberNativePageScrollPosition();

  window.addEventListener("scroll", rememberNativePageScrollPosition, {
    passive: true,
  });
  window.addEventListener("scroll", restoreBottomChatPageScrollPosition, {
    passive: true,
  });
  window.addEventListener("scroll", alignRightChatKeyboardViewport, {
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
  document.addEventListener("touchmove", preventRightChatPageScroll, {
    capture: true,
    passive: false,
  });
  document.addEventListener("wheel", preventRightChatPageScroll, {
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
    const referenceWidth = layoutMetricsState.lockedMobileViewportMetrics?.width
      || layoutMetricsState.lastViewportMetrics?.width
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
    if (!isBottomChatInputFocused() && !isRightChatKeyboardOpen()) {
      preservePageBottomAfterViewportChange();
    }
    scheduleLayoutMetricsSync(!isMobileLayout() || widthChanged);
  }, {
    passive: true,
  });
  window.addEventListener("orientationchange", () => {
    captureOrientationScrollPosition();
    scheduleLayoutMetricsSync(true);
  }, {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    () => {
      const viewportWidth = Math.round(window.visualViewport?.width || 0);
      const widthChanged = Boolean(
        viewportWidth
        && layoutMetricsState.lockedMobileViewportMetrics
        && viewportWidth !== layoutMetricsState.lockedMobileViewportMetrics.width,
      );
      if (!isBottomChatInputFocused() && !isRightChatKeyboardOpen()) {
        preservePageBottomAfterViewportChange();
      }
      scheduleLayoutMetricsSync(widthChanged);
    },
    { passive: true },
  );
  layoutMetricsState.lastFullscreenActive = isFullscreenActive();
  document.addEventListener("fullscreenchange", scheduleFullscreenMetricResync);
  document.addEventListener("pointerdown", (event) => {
    if (isBottomChatKeyboardTarget(event.target)) {
      if (dom.sessionView?.dataset.chatDock === "right") {
        captureRightChatKeyboardScroll(true);
      }
      // pointerdown ocurre antes de focusin y antes de que el header se
      // contraiga. Capturar aquí evita usar como origen una posición
      // intermedia del reflow del chat.
      captureBottomChatKeyboardHandlePosition();
    }
  }, { capture: true, passive: true });
  document.addEventListener("focusin", (event) => {
    if (isBottomChatKeyboardTarget(event.target)) {
      if (dom.sessionView?.dataset.chatDock === "right") {
        captureRightChatKeyboardScroll();
      }
      // Preparar el anclaje antes de que Chrome reduzca el viewport evita que
      // la flecha permanezca un instante en su posición vieja.
      captureBottomChatKeyboardHandlePosition();
      scheduleLayoutMetricsSync();
    }
  }, { passive: true });
  document.addEventListener("focusout", (event) => {
    if (isBottomChatKeyboardTarget(event.target)) {
      scheduleLayoutMetricsSync();
      if (!isBottomChatKeyboardOpen() && !layoutMetricsState.wasBottomChatKeyboardOpen) {
        window.setTimeout(() => {
          if (!isBottomChatKeyboardOpen() && !layoutMetricsState.wasBottomChatKeyboardOpen) {
            restoreBottomChatKeyboardHandlePosition();
          }
        }, 140);
      }
    }
  }, { passive: true });
  if ("MutationObserver" in window && document.body) {
    layoutMetricsState.bodyObserver?.disconnect?.();
    layoutMetricsState.bodyObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "class")) {
        const fullscreenActive = isFullscreenActive();
        if (fullscreenActive !== layoutMetricsState.lastFullscreenActive) {
          layoutMetricsState.lastFullscreenActive = fullscreenActive;
          scheduleFullscreenMetricResync();
          return;
        }
        scheduleLayoutMetricsSync(true);
      }
    });
    layoutMetricsState.bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  if ("ResizeObserver" in window && dom.sessionToolbar) {
    layoutMetricsState.toolbarObserver?.disconnect?.();
    layoutMetricsState.toolbarObserver = new ResizeObserver(scheduleLayoutMetricsSync);
    layoutMetricsState.toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
}

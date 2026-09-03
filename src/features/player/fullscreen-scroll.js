import { dom } from "../../core/dom.js";

let pendingScrollTop = null;
let pendingRestoreAtBottom = false;
let pageScrollBeforeFullscreen = null;
let pageWasAtBottomBeforeFullscreen = false;
const EXIT_RESTORE_WINDOW_MS = 3000;

function getScrollContainer() {
  return dom.sessionView?.closest(".app-shell")
    || document.scrollingElement
    || document.documentElement;
}

function getContainerScrollTop() {
  return Math.round(getScrollContainer().scrollTop || 0);
}

function getPageScrollTop() {
  return Math.round(Math.max(
    window.scrollY || 0,
    document.scrollingElement?.scrollTop || 0,
  ));
}

function getScrollMax(isFullscreen) {
  if (!isFullscreen) {
    return Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  }

  const container = getScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
}

export function captureFullscreenScroll(isEntering) {
  if (pendingScrollTop != null) return;
  if (isEntering) {
    pageScrollBeforeFullscreen = getPageScrollTop();
    pageWasAtBottomBeforeFullscreen = pageScrollBeforeFullscreen
      >= getScrollMax(false) - 4;
    pendingScrollTop = pageScrollBeforeFullscreen;
    pendingRestoreAtBottom = false;
    return;
  }

  // En fullscreen el shell es fijo y normalmente tiene scrollTop=0. Para
  // volver a la página hay que recuperar la posición anterior, no esa
  // posición interna del shell.
  pendingScrollTop = pageScrollBeforeFullscreen ?? getContainerScrollTop();
  pendingRestoreAtBottom = pageScrollBeforeFullscreen != null
    && pageWasAtBottomBeforeFullscreen;
}

export function restoreFullscreenScroll(isFullscreen) {
  if (pendingScrollTop == null) return;

  const savedScrollTop = pendingScrollTop;
  const restoreAtBottom = pendingRestoreAtBottom;
  pendingScrollTop = null;
  pendingRestoreAtBottom = false;

  const restore = () => {
    const maxScroll = getScrollMax(isFullscreen);
    const top = !isFullscreen && restoreAtBottom
      ? maxScroll
      : Math.min(savedScrollTop, maxScroll);
    if (isFullscreen) {
      getScrollContainer().scrollTo({ top, behavior: "auto" });
      return;
    }
    if (getPageScrollTop() !== top) {
      window.scrollTo({ top, behavior: "auto" });
    }
  };

  // Al salir, Android todavía puede estar rotando y cambiando las barras del
  // navegador. Reintentar durante esa transición permite usar el máximo real
  // y evita que el formulario quede fuera del viewport.
  const restoreUntil = performance.now() + (isFullscreen ? 80 : EXIT_RESTORE_WINDOW_MS);
  const handleViewportChange = () => restore();
  if (!isFullscreen) {
    window.addEventListener("resize", handleViewportChange, { passive: true });
    window.addEventListener("orientationchange", handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
  }
  const cleanup = () => {
    if (isFullscreen) return;
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("orientationchange", handleViewportChange);
    window.visualViewport?.removeEventListener("resize", handleViewportChange);
  };
  const scheduleRestore = () => {
    restore();
    if (performance.now() < restoreUntil) {
      window.requestAnimationFrame(scheduleRestore);
      return;
    }
    cleanup();
    if (!isFullscreen) {
      pageScrollBeforeFullscreen = null;
      pageWasAtBottomBeforeFullscreen = false;
    }
  };
  window.requestAnimationFrame(scheduleRestore);
}

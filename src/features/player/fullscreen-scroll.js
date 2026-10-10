import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

let pendingScrollTop = null;
let pendingRestoreAtBottom = false;
let pageScrollBeforeFullscreen = null;
let pageWasAtBottomBeforeFullscreen = false;
const EXIT_RESTORE_WINDOW_MS = 3000;
const PAGE_SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

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

export function restoreFullscreenScroll(isFullscreen, preferredFullscreenScrollTop = null) {
  if (pendingScrollTop == null) return;

  const savedScrollTop = pendingScrollTop;
  const restoreAtBottom = pendingRestoreAtBottom;
  const fullscreenScrollTop = Number.isFinite(preferredFullscreenScrollTop)
    ? Math.max(0, preferredFullscreenScrollTop)
    : savedScrollTop;
  pendingScrollTop = null;
  pendingRestoreAtBottom = false;

  const restore = () => {
    const maxScroll = getScrollMax(isFullscreen);
    const top = isFullscreen
      ? Math.min(fullscreenScrollTop, maxScroll)
      : restoreAtBottom
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
  let restoreCancelled = false;
  let cleanup = () => {};
  const cancelOnScrollKey = (event) => {
    if (PAGE_SCROLL_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      restoreCancelled = true;
      cleanup();
    }
  };
  const cancelRestore = () => {
    restoreCancelled = true;
    cleanup();
  };
  if (!isFullscreen) {
    window.addEventListener("resize", handleViewportChange, { passive: true });
    window.addEventListener("orientationchange", handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
    // La restauración acompaña los últimos cambios de viewport al salir de
    // fullscreen, pero nunca debe pisar un desplazamiento iniciado por el
    // usuario. Antes el bucle de RAF duraba 3 s y hacía que el scroll pareciera
    // bloqueado durante toda esa ventana.
    window.addEventListener("wheel", cancelRestore, { capture: true, passive: true });
    window.addEventListener("touchstart", cancelRestore, { capture: true, passive: true });
    window.addEventListener("touchmove", cancelRestore, { capture: true, passive: true });
    window.addEventListener("pointerdown", cancelRestore, { capture: true, passive: true });
    window.addEventListener("keydown", cancelOnScrollKey, { capture: true, passive: true });
  }
  cleanup = () => {
    if (isFullscreen) return;
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("orientationchange", handleViewportChange);
    window.visualViewport?.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("wheel", cancelRestore, true);
    window.removeEventListener("touchstart", cancelRestore, true);
    window.removeEventListener("touchmove", cancelRestore, true);
    window.removeEventListener("pointerdown", cancelRestore, true);
    window.removeEventListener("keydown", cancelOnScrollKey, true);
    pageScrollBeforeFullscreen = null;
    pageWasAtBottomBeforeFullscreen = false;
  };
  const scheduleRestore = () => {
    if (restoreCancelled) return;
    restore();
    if (performance.now() < restoreUntil) {
      window.requestAnimationFrame(scheduleRestore);
      return;
    }
    cleanup();
  };
  window.requestAnimationFrame(scheduleRestore);
}

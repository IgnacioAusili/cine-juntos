import { dom } from "../../core/dom.js";

let pendingScrollTop = null;

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
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  const container = getScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
}

export function captureFullscreenScroll(isEntering) {
  if (pendingScrollTop != null) return;
  pendingScrollTop = isEntering ? getPageScrollTop() : getContainerScrollTop();
}

export function restoreFullscreenScroll(isFullscreen) {
  if (pendingScrollTop == null) return;

  const savedScrollTop = pendingScrollTop;
  pendingScrollTop = null;

  const restore = () => {
    const top = Math.min(savedScrollTop, getScrollMax(isFullscreen));
    if (isFullscreen) {
      getScrollContainer().scrollTo({ top, behavior: "auto" });
      return;
    }
    window.scrollTo({ top, behavior: "auto" });
  };

  // El cambio de fullscreen también cambia el contenedor y sus dimensiones.
  // Esperar un frame evita restaurar contra la geometría anterior.
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
}

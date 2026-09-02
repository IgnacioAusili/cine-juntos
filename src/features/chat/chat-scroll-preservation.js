// Conserva el scroll de pagina mientras el dock lateral termina su reflow.
const RESTORE_WINDOW_MS = 1200;
let activeCleanup = null;

export function restorePageScrollAfterRightChatCollapse(scrollTop, options = {}) {
  if (!Number.isFinite(scrollTop)) return;

  const {
    getPageScrollContainer,
    getPageScrollMax,
    getPageScrollTop,
    isCollapsed,
    scrollPageTo,
  } = options;
  if (!getPageScrollContainer || !getPageScrollMax || !getPageScrollTop || !isCollapsed || !scrollPageTo) {
    return;
  }

  activeCleanup?.();
  const scrollTarget = getPageScrollContainer();
  const startedAt = performance.now();
  let frameId = 0;
  let timeoutId = 0;

  const cleanup = () => {
    if (scrollTarget === window) {
      window.removeEventListener("scroll", onScroll);
    } else {
      scrollTarget.removeEventListener("scroll", onScroll);
    }
    if (frameId) window.cancelAnimationFrame(frameId);
    if (timeoutId) window.clearTimeout(timeoutId);
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  const restore = () => {
    frameId = 0;
    if (!isCollapsed()) {
      cleanup();
      return;
    }

    // Durante el reflow el maximo puede caer temporalmente. El intento actual
    // se clampa, pero el siguiente frame vuelve a probar contra el nuevo maximo.
    const targetTop = Math.min(scrollTop, getPageScrollMax());
    if (getPageScrollTop() !== targetTop) scrollPageTo(targetTop, "auto");

    if (performance.now() - startedAt < RESTORE_WINDOW_MS) {
      frameId = window.requestAnimationFrame(restore);
    } else {
      cleanup();
    }
  };
  const onScroll = () => restore();

  if (scrollTarget === window) {
    window.addEventListener("scroll", onScroll, { passive: true });
  } else {
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
  }
  activeCleanup = cleanup;
  timeoutId = window.setTimeout(cleanup, RESTORE_WINDOW_MS + 120);
  restore();
}

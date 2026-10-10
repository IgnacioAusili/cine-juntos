import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

let responsiveSessionLayoutObserver = null;
let responsiveSessionLayoutFrame = 0;
let syncCollapseHandleOffset = () => {};

export function getVideoAreaRect() {
  if (!dom.videoArea) return null;
  const rect = dom.videoArea.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}
export function isStackedSessionLayout() {
  if (!dom.sessionView) return false;
  return getComputedStyle(dom.sessionView)
    .getPropertyValue("--session-layout-mode")
    .trim() === "stacked";
}

function setResponsiveSessionLayout(stacked) {
  if (!dom.sessionView) return;
  dom.sessionView.classList.toggle("layout-stacked", stacked);
  dom.sessionView.style.setProperty(
    "--session-layout-mode",
    stacked ? "stacked" : "side-by-side",
  );
}

function measureResponsiveSessionLayout() {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) return;

  const isCoarsePointer = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  ).matches;
  if (dom.sessionView.dataset.chatDock !== "right" || isCoarsePointer) {
    setResponsiveSessionLayout(isCoarsePointer);
    syncCollapseHandleOffset();
    return;
  }

  const isCollapsed = dom.sessionView.classList.contains("chat-collapsed");
  if (
    dom.sessionView.classList.contains("chat-layout-transitioning")
    || dom.sessionView.classList.contains("chat-dock-switching")
  ) return;

  const wasStacked = dom.sessionView.classList.contains("layout-stacked");
  const previousChatAreaStyle = isCollapsed ? dom.chatArea.getAttribute("style") : null;
  dom.sessionView.classList.add("layout-fit-check");
  dom.sessionView.classList.remove("layout-stacked");

  let stacked = false;
  try {
    if (isCollapsed) {
      // Un panel colapsado mide cero y no permite saber si cabe en la nueva
      // ventana. Recuperar su geometría solo durante esta lectura mantiene
      // estable el estado del chat y evita dejar obsoleto el modo responsive.
      dom.chatArea.style.setProperty("flex-basis", "var(--chat-panel-width)");
      dom.chatArea.style.setProperty("width", "var(--chat-panel-width)");
      dom.chatArea.style.setProperty("min-width", "0");
      dom.chatArea.style.setProperty("opacity", "1");
      dom.chatArea.style.setProperty("pointer-events", "auto");
    }

    const videoRect = dom.videoArea?.getBoundingClientRect();
    const chatRect = dom.chatArea.getBoundingClientRect();
    stacked = Boolean(
      videoRect
        && chatRect.width > 0
        && chatRect.top > videoRect.top + 1,
    );
  } finally {
    if (isCollapsed) {
      if (previousChatAreaStyle === null) {
        dom.chatArea.removeAttribute("style");
      } else {
        dom.chatArea.setAttribute("style", previousChatAreaStyle);
      }
    }
    dom.sessionView.classList.remove("layout-fit-check");
    if (wasStacked) dom.sessionView.classList.add("layout-stacked");
  }

  setResponsiveSessionLayout(stacked);
  syncCollapseHandleOffset();
}

function scheduleResponsiveSessionLayoutMeasure() {
  if (responsiveSessionLayoutFrame) return;
  responsiveSessionLayoutFrame = window.requestAnimationFrame(() => {
    responsiveSessionLayoutFrame = 0;
    measureResponsiveSessionLayout();
  });
}

export function wireResponsiveSessionLayout(syncHandleOffset = () => {}) {
  syncCollapseHandleOffset = syncHandleOffset;
  if (!dom.sessionView || !dom.workspace) return;

  scheduleResponsiveSessionLayoutMeasure();
  if ("ResizeObserver" in window && !responsiveSessionLayoutObserver) {
    responsiveSessionLayoutObserver = new ResizeObserver(
      scheduleResponsiveSessionLayoutMeasure,
    );
    responsiveSessionLayoutObserver.observe(dom.workspace);
  }
  window.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.visualViewport?.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.addEventListener(
    "chat-layout-settled",
    scheduleResponsiveSessionLayoutMeasure,
    { passive: true },
  );
}

import { syncComponentStackChatHandle } from "./component-stack-controls.js?v=20261008";
import { syncComponentStackShellInsets } from "./component-stack-insets.js?v=20261008";
import { wireComponentAspectObservers } from "./component-aspect-observers.js?v=20261008-unified-panel-layout-01";
import {
  hasLoadedVideo,
  isMeasuringExpandedTarget,
  measurePanelLayoutTarget,
} from "./component-aspect-measurement.js?v=20261008-unified-panel-layout-01";

const sessionView = document.querySelector("#sessionView");
const appShell = document.querySelector(".app-shell");
const workspace = sessionView?.querySelector(".workspace");
const videoArea = sessionView?.querySelector(".video-area");
const videoPlayer = sessionView?.querySelector("#videoPlayer");
const playerFrame = sessionView?.querySelector(".player-frame");
const chatArea = sessionView?.querySelector(".chat-area");
const FULL_PANEL_LAYOUT_CLASS = "layout-component-stack";
const EDGE_TO_EDGE_LAYOUT_CLASS = "layout-edge-to-edge";
const BOTTOM_DOCK_FIT_VIEWPORT_CLASS = "bottom-dock-panels-fit-viewport";

let pendingFrame = 0;
let pendingScrollTarget = "";
let initialSessionScrollPending = true;

function getStructuralViewportHeight() {
  const configuredHeight = Number.parseFloat(
    getComputedStyle(document.documentElement)
      .getPropertyValue("--app-viewport-height"),
  );
  return configuredHeight > 0
    ? configuredHeight
    : document.documentElement.clientHeight || window.innerHeight;
}

function applyComponentLayoutState({
  shouldStack,
  combinedPanelHeight,
  hasMeasuredPanels,
}) {
  const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isExpandedBottomDock = sessionView?.dataset.chatDock === "bottom"
    && !sessionView.classList.contains("chat-collapsed");
  const viewportHeight = getStructuralViewportHeight();
  const panelsFitViewport = Boolean(
    isExpandedBottomDock
    && hasMeasuredPanels
    && !shouldStack
    && combinedPanelHeight <= viewportHeight + 1
  );
  const needsScrollSnap = Boolean(
    isDesktop
    && isExpandedBottomDock
    && hasMeasuredPanels
    && (shouldStack || combinedPanelHeight > viewportHeight + 1),
  );

  // Los tres estados se aplican desde la misma medición antes del siguiente
  // repintado: ni el scroll ni una segunda medición de visibilidad los separa.
  sessionView?.classList.toggle(FULL_PANEL_LAYOUT_CLASS, shouldStack);
  sessionView?.classList.toggle(BOTTOM_DOCK_FIT_VIEWPORT_CLASS, panelsFitViewport);
  sessionView?.classList.toggle("chat-bottom-snap-enabled", needsScrollSnap);
  syncComponentStackChatHandle(sessionView, chatArea);
}

function syncEdgeToEdgeLayout() {
  if (!sessionView || !appShell) return;

  const shellBounds = appShell.getBoundingClientRect();
  const sessionBounds = sessionView.getBoundingClientRect();
  const fillsShellWidth = shellBounds.width > 0
    && sessionBounds.width > 0
    && sessionBounds.left <= shellBounds.left
    && sessionBounds.right >= shellBounds.right;

  sessionView.classList.toggle(EDGE_TO_EDGE_LAYOUT_CLASS, fillsShellWidth);
}

function measureComponentLayout({ allowDuringChatTransition = false } = {}) {
  pendingFrame = 0;
  syncComponentStackShellInsets(appShell, sessionView, workspace);
  syncEdgeToEdgeLayout();
  const wasStacked = sessionView?.classList.contains(FULL_PANEL_LAYOUT_CLASS);
  if (
    sessionView?.classList.contains("chat-layout-transitioning")
    && !allowDuringChatTransition
  ) return;

  const targetLayout = measurePanelLayoutTarget({
    sessionView,
    appShell,
    workspace,
    videoArea,
    playerFrame,
    chatArea,
    videoPlayer,
  });
  const shouldStack = targetLayout.shouldStack;
  if (
    shouldStack
    && !wasStacked
    && !sessionView.classList.contains("chat-collapsed")
    && !pendingScrollTarget
  ) {
    pendingScrollTarget = "center-video";
  }

  applyComponentLayoutState({ ...targetLayout, shouldStack });

  const scrollTarget = pendingScrollTarget;
  pendingScrollTarget = "";
  const shouldResolveInitialScroll = initialSessionScrollPending && !sessionView?.hidden;
  if (!scrollTarget && !shouldResolveInitialScroll) return;
  if (!sessionView) return;

  window.requestAnimationFrame(() => {
    if (sessionView.hidden) return;

    const isCollapsed = sessionView.classList.contains("chat-collapsed");
    const isStacked = sessionView.classList.contains(FULL_PANEL_LAYOUT_CLASS);
    if (initialSessionScrollPending) {
      initialSessionScrollPending = false;
      if (!hasLoadedVideo()) {
        window.scrollTo({ top: 0, behavior: "auto" });
      } else if (
        sessionView.dataset.chatDock === "bottom"
        && (isStacked || isCollapsed)
      ) {
        videoArea.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      }
      return;
    }

    if (sessionView.dataset.chatDock !== "bottom") return;
    if (scrollTarget === "reveal-chat" && isStacked && !isCollapsed) {
      const chatTop = chatArea.getBoundingClientRect().top;
      if (Math.abs(chatTop) > 1) {
        chatArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      }
    } else if (
      scrollTarget === "center-video"
      && (isStacked || isCollapsed)
      && hasLoadedVideo()
    ) {
      videoArea.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    }
  });
}

function scheduleComponentLayoutMeasure(scrollTarget = "") {
  if (scrollTarget === "reveal-chat") {
    pendingScrollTarget = "reveal-chat";
  } else if (scrollTarget === "center-video" && pendingScrollTarget !== "reveal-chat") {
    pendingScrollTarget = "center-video";
  }
  if (pendingFrame) return;
  pendingFrame = window.requestAnimationFrame(measureComponentLayout);
}

export function syncComponentAspectLayoutNow(options = {}) {
  // La entrada a sala lo llama antes de ceder el hilo; el primer frame visible
  // ya usa el tamaño medido y no muestra primero las filas compactas.
  if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  measureComponentLayout(options);
}

wireComponentAspectObservers({
  sessionView,
  workspace,
  videoArea,
  videoPlayer,
  playerFrame,
  chatArea,
  scheduleComponentLayoutMeasure,
  isMeasuringExpandedTarget,
});

window.addEventListener("load", scheduleComponentLayoutMeasure, { once: true });

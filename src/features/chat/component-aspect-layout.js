import { syncComponentStackChatHandle } from "./component-stack-controls.js?v=20260930-header-visual-center-offset-02-chat-handle-flow-01";
import { syncComponentStackShellInsets } from "./component-stack-insets.js?v=20260929-edge-to-edge-stack-inset-01";
import { wireComponentAspectObservers } from "./component-aspect-observers.js?v=20261004-empty-player-start-scroll-01";
import {
  hasLoadedVideo,
  isMeasuringExpandedTarget,
  needsFullPanelLayout,
} from "./component-aspect-measurement.js?v=20261007-bottom-chat-first-paint-01";

const sessionView = document.querySelector("#sessionView");
const appShell = document.querySelector(".app-shell");
const workspace = sessionView?.querySelector(".workspace");
const videoArea = sessionView?.querySelector(".video-area");
const videoPlayer = sessionView?.querySelector("#videoPlayer");
const playerFrame = sessionView?.querySelector(".player-frame");
const chatArea = sessionView?.querySelector(".chat-area");
const FULL_PANEL_LAYOUT_CLASS = "layout-component-stack";
const EDGE_TO_EDGE_LAYOUT_CLASS = "layout-edge-to-edge";

let pendingFrame = 0;
let pendingScrollTarget = "";
let initialSessionScrollPending = true;

function syncBottomDockSnapMode() {
  const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isExpandedBottomDock = sessionView?.dataset.chatDock === "bottom"
    && !sessionView.classList.contains("chat-collapsed");
  const videoRect = videoArea?.getBoundingClientRect();
  const chatRect = chatArea?.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const combinedPanelHeight = videoRect && chatRect
    ? Math.max(videoRect.bottom, chatRect.bottom) - Math.min(videoRect.top, chatRect.top)
    : 0;
  const needsScrollSnap = Boolean(
    isDesktop
    && isExpandedBottomDock
    && videoRect?.height > 0
    && chatRect?.height > 0
    && combinedPanelHeight > viewportHeight + 1,
  );

  sessionView?.classList.toggle("chat-bottom-snap-enabled", needsScrollSnap);
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
  const shouldStack = sessionView?.classList.contains("chat-layout-transitioning")
    && !allowDuringChatTransition
    ? Boolean(wasStacked)
    : needsFullPanelLayout({
      sessionView,
      appShell,
      workspace,
      playerFrame,
      chatArea,
      videoPlayer,
    });
  if (
    shouldStack
    && !wasStacked
    && !sessionView.classList.contains("chat-collapsed")
    && !pendingScrollTarget
  ) {
    pendingScrollTarget = "center-video";
  }

  sessionView?.classList.toggle(FULL_PANEL_LAYOUT_CLASS, shouldStack);
  syncComponentStackChatHandle(sessionView, chatArea);
  syncBottomDockSnapMode();

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
  videoPlayer,
  playerFrame,
  chatArea,
  scheduleComponentLayoutMeasure,
  isMeasuringExpandedTarget,
});

window.addEventListener("resize", scheduleComponentLayoutMeasure, { passive: true });

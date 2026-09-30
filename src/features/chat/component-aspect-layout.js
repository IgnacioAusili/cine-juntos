import { syncComponentStackChatHandle } from "./component-stack-controls.js?v=20260928-chat-aspect-layout-01";
import { syncComponentStackShellInsets } from "./component-stack-insets.js?v=20260929-edge-to-edge-stack-inset-01";

const sessionView = document.querySelector("#sessionView");
const appShell = document.querySelector(".app-shell");
const workspace = sessionView?.querySelector(".workspace");
const videoArea = sessionView?.querySelector(".video-area");
const videoPlayer = sessionView?.querySelector("#videoPlayer");
const playerFrame = sessionView?.querySelector(".player-frame");
const chatArea = sessionView?.querySelector(".chat-area");
const FULL_PANEL_LAYOUT_CLASS = "layout-component-stack";
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

let pendingFrame = 0;
let expandedChatTransitionPending = false;
let pendingScrollTarget = "";

function getVideoAspectRatio() {
  if (videoPlayer?.videoWidth > 0 && videoPlayer.videoHeight > 0) {
    return videoPlayer.videoWidth / videoPlayer.videoHeight;
  }

  const cssAspectRatio = getComputedStyle(videoPlayer).aspectRatio;
  const [width, height] = cssAspectRatio.split("/").map(Number);
  return width > 0 && height > 0
    ? width / height
    : DEFAULT_VIDEO_ASPECT_RATIO;
}

function needsFullPanelLayout() {
  if (
    !sessionView
    || !workspace
    || !playerFrame
    || !chatArea
    || sessionView.dataset.chatDock !== "bottom"
    || sessionView.classList.contains("chat-collapsed")
  ) return false;

  const wasExpanded = sessionView.classList.contains(FULL_PANEL_LAYOUT_CLASS);
  if (wasExpanded) sessionView.classList.remove(FULL_PANEL_LAYOUT_CLASS);

  const videoRect = playerFrame.getBoundingClientRect();
  const chatRect = chatArea.getBoundingClientRect();
  const requiredVideoHeight = videoRect.width / getVideoAspectRatio();
  const shouldExpand = Boolean(
    videoRect.width > 0
    && videoRect.height > 0
    && chatRect.width > 0
    && chatRect.height > 0
    && videoRect.height < requiredVideoHeight,
  );

  if (wasExpanded) sessionView.classList.add(FULL_PANEL_LAYOUT_CLASS);
  return shouldExpand;
}

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

function measureComponentLayout() {
  pendingFrame = 0;
  syncComponentStackShellInsets(appShell, sessionView, workspace);
  const wasStacked = sessionView?.classList.contains(FULL_PANEL_LAYOUT_CLASS);
  const shouldStack = needsFullPanelLayout();
  if (shouldStack && !wasStacked && !pendingScrollTarget) {
    pendingScrollTarget = "center-video";
  }

  sessionView?.classList.toggle(FULL_PANEL_LAYOUT_CLASS, shouldStack);
  syncComponentStackChatHandle(sessionView, chatArea);
  syncBottomDockSnapMode();

  const scrollTarget = pendingScrollTarget;
  pendingScrollTarget = "";
  if (!scrollTarget) return;

  if (
    !sessionView
    || sessionView.dataset.chatDock !== "bottom"
  ) return;

  window.requestAnimationFrame(() => {
    if (sessionView?.dataset.chatDock !== "bottom") return;

    const isCollapsed = sessionView.classList.contains("chat-collapsed");
    const isStacked = sessionView.classList.contains(FULL_PANEL_LAYOUT_CLASS);
    if (scrollTarget === "reveal-chat" && isStacked && !isCollapsed) {
      chatArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    } else if (scrollTarget === "center-video" && (isStacked || isCollapsed)) {
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

if (sessionView && workspace && videoPlayer && playerFrame && chatArea) {
  const workspaceObserver = new ResizeObserver(scheduleComponentLayoutMeasure);
  workspaceObserver.observe(workspace);
  workspaceObserver.observe(sessionView);

  const dockObserver = new MutationObserver(scheduleComponentLayoutMeasure);
  dockObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["data-chat-dock"],
  });

  const layoutStateObserver = new MutationObserver((records) => {
    const currentClasses = new Set(sessionView.className.split(/\s+/));
    let shouldMeasure = false;
    let shouldReveal = false;

    let shouldCenterVideo = false;
    for (const record of records) {
      if (record.attributeName !== "class") continue;

      const previousClasses = new Set((record.oldValue || "").split(/\s+/));
      const justExpanded = previousClasses.has("chat-collapsed")
        && !currentClasses.has("chat-collapsed");
      const justCollapsed = !previousClasses.has("chat-collapsed")
        && currentClasses.has("chat-collapsed");
      const transitionJustSettled = previousClasses.has("chat-layout-transitioning")
        && !currentClasses.has("chat-layout-transitioning");

      if (justExpanded) {
        if (currentClasses.has("chat-layout-transitioning")) {
          expandedChatTransitionPending = true;
        } else {
          shouldMeasure = true;
          shouldReveal = true;
        }
      }

      if (transitionJustSettled && expandedChatTransitionPending) {
        expandedChatTransitionPending = false;
        shouldMeasure = true;
        shouldReveal = true;
      }

      if (justCollapsed) {
        shouldMeasure = true;
        shouldCenterVideo = true;
      }
    }

    if (shouldMeasure) {
      scheduleComponentLayoutMeasure(
        shouldReveal ? "reveal-chat" : shouldCenterVideo ? "center-video" : "",
      );
    }
  });
  layoutStateObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  });

  videoPlayer.addEventListener("loadedmetadata", () => {
    scheduleComponentLayoutMeasure("center-video");
  });
  window.addEventListener("resize", () => {
    scheduleComponentLayoutMeasure("center-video");
  }, { passive: true });
  window.addEventListener("chat-layout-settled", () => {
    scheduleComponentLayoutMeasure("center-video");
  }, {
    passive: true,
  });
  scheduleComponentLayoutMeasure("center-video");
}

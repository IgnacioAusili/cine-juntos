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
let revealExpandedChatAfterMeasure = false;

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
    || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
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

function syncComponentStackShellInsets() {
  if (!appShell || !workspace) return;

  const shellStyle = getComputedStyle(appShell);
  const bottomPadding = Number.parseFloat(shellStyle.paddingBottom);
  const topPadding = Number.parseFloat(shellStyle.paddingTop);
  const inset = Number.isFinite(bottomPadding) ? Math.max(0, bottomPadding) : 0;
  const topInset = Number.isFinite(topPadding) ? Math.max(0, topPadding) : 0;
  const insetValue = `${inset}px`;
  const topInsetValue = `${topInset}px`;

  if (
    workspace.style.getPropertyValue("--component-stack-viewport-bottom-inset")
    !== insetValue
  ) {
    workspace.style.setProperty("--component-stack-viewport-bottom-inset", insetValue);
  }

  if (
    workspace.style.getPropertyValue("--component-stack-viewport-top-inset")
    !== topInsetValue
  ) {
    workspace.style.setProperty("--component-stack-viewport-top-inset", topInsetValue);
  }
}

function measureComponentLayout() {
  pendingFrame = 0;
  syncComponentStackShellInsets();
  const shouldStack = needsFullPanelLayout();

  if (
    shouldStack
    && sessionView?.dataset.chatDock === "bottom"
    && !sessionView.classList.contains("chat-collapsed")
  ) {
    // Al estrechar o cambiar el alto del viewport, las filas responsive pueden
    // mover la unión aunque el chat ya estuviera abierto. Mantener el panel
    // alineado al inicio oculta el video completo en el dock inferior.
    revealExpandedChatAfterMeasure = true;
  }

  sessionView?.classList.toggle(FULL_PANEL_LAYOUT_CLASS, shouldStack);
  syncBottomDockSnapMode();

  if (!revealExpandedChatAfterMeasure) return;
  revealExpandedChatAfterMeasure = false;

  if (
    !shouldStack
    || sessionView?.classList.contains("chat-collapsed")
    || sessionView?.dataset.chatDock !== "bottom"
  ) return;

  window.requestAnimationFrame(() => {
    if (
      sessionView?.classList.contains(FULL_PANEL_LAYOUT_CLASS)
      && !sessionView.classList.contains("chat-collapsed")
      && sessionView.dataset.chatDock === "bottom"
    ) {
      chatArea.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    }
  });
}

function scheduleComponentLayoutMeasure(revealExpandedChat = false) {
  if (revealExpandedChat) revealExpandedChatAfterMeasure = true;
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

      if (justCollapsed) shouldMeasure = true;
    }

    if (shouldMeasure) scheduleComponentLayoutMeasure(shouldReveal);
  });
  layoutStateObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  });

  videoPlayer.addEventListener("loadedmetadata", scheduleComponentLayoutMeasure);
  window.addEventListener("resize", scheduleComponentLayoutMeasure, { passive: true });
  window.addEventListener("chat-layout-settled", scheduleComponentLayoutMeasure, {
    passive: true,
  });
  scheduleComponentLayoutMeasure();
}

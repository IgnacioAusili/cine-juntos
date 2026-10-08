const FULL_PANEL_LAYOUT_CLASS = "layout-component-stack";
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

let measuringExpandedTarget = false;

function capturePageScrollPosition(appShell) {
  const isFullscreen = Boolean(document.fullscreenElement)
    || document.body.classList.contains("fullscreen-mode");
  const container = isFullscreen ? appShell : null;
  return {
    container,
    top: container ? container.scrollTop : window.scrollY,
  };
}

function restorePageScrollPosition(position) {
  if (!position) return;

  const currentTop = position.container ? position.container.scrollTop : window.scrollY;
  if (Math.abs(currentTop - position.top) < 1) return;

  if (position.container) {
    position.container.scrollTop = position.top;
  } else {
    window.scrollTo({ top: position.top, behavior: "instant" });
  }
}

function getVideoAspectRatio(videoPlayer) {
  if (videoPlayer?.videoWidth > 0 && videoPlayer.videoHeight > 0) {
    return videoPlayer.videoWidth / videoPlayer.videoHeight;
  }

  const cssAspectRatio = getComputedStyle(videoPlayer).aspectRatio;
  const [width, height] = cssAspectRatio.split("/").map(Number);
  return width > 0 && height > 0
    ? width / height
    : DEFAULT_VIDEO_ASPECT_RATIO;
}

export function hasLoadedVideo(videoPlayer) {
  return Boolean(
    (videoPlayer?.currentSrc || videoPlayer?.getAttribute("src"))
    && videoPlayer.readyState >= HTMLMediaElement.HAVE_METADATA,
  );
}

export function isMeasuringExpandedTarget() {
  return measuringExpandedTarget;
}

export function needsFullPanelLayout({
  sessionView,
  appShell,
  workspace,
  playerFrame,
  chatArea,
  videoPlayer,
}) {
  if (
    !sessionView
    || !workspace
    || !playerFrame
    || !chatArea
    || sessionView.dataset.chatDock !== "bottom"
  ) return false;

  const wasCollapsed = sessionView.classList.contains("chat-collapsed");
  const wasExpanded = sessionView.classList.contains(FULL_PANEL_LAYOUT_CLASS);
  const preservedScrollPosition = wasCollapsed || wasExpanded
    ? capturePageScrollPosition(appShell)
    : null;
  const shouldSuppressTransitions = wasCollapsed || wasExpanded;
  if (shouldSuppressTransitions) {
    sessionView.classList.add("component-layout-measuring");
    // Aplicar el estado temporal antes de medir evita que se anime.
    void getComputedStyle(sessionView).transitionProperty;
  }
  if (wasCollapsed) measuringExpandedTarget = true;
  if (wasExpanded) sessionView.classList.remove(FULL_PANEL_LAYOUT_CLASS);
  if (wasCollapsed) sessionView.classList.remove("chat-collapsed");

  // Medir la geometría que tendrá el dock al expandirse.
  const videoRect = playerFrame.getBoundingClientRect();
  const chatRect = chatArea.getBoundingClientRect();
  const requiredVideoHeight = videoRect.width / getVideoAspectRatio(videoPlayer);
  const shouldExpand = Boolean(
    videoRect.width > 0
    && videoRect.height > 0
    && chatRect.width > 0
    && chatRect.height > 0
    && videoRect.height < requiredVideoHeight,
  );

  if (wasCollapsed) {
    sessionView.classList.add("chat-collapsed");
    // Dejar que la mutación temporal llegue a los observers antes de aceptar acciones.
    queueMicrotask(() => {
      measuringExpandedTarget = false;
    });
  }
  if (wasExpanded) sessionView.classList.add(FULL_PANEL_LAYOUT_CLASS);
  restorePageScrollPosition(preservedScrollPosition);
  if (shouldSuppressTransitions) {
    sessionView.classList.remove("component-layout-measuring");
  }
  return shouldExpand;
}

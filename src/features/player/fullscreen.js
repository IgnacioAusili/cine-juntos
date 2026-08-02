import {
  dom,
} from "../../core/dom.js";
import {
  FULLSCREEN_END_GAP,
  FULLSCREEN_SNAP_DELAY_MS,
  FULLSCREEN_SNAP_THRESHOLD,
} from "../../core/utils.js";
import {
  hydrateIcons,
} from "../icons-tooltips.js";
import { focusFullscreenWorkspace, setSyncStatus } from "../session-ui.js";
import {
  logEvent,
} from "../../core/state.js";
import { syncInsideChatPanelOffset } from "../chat/chat-layout.js";
import { withShortcutHint } from "../../core/utils.js";

const PLAYER_OVERLAY_IDLE_MS = 1600;
let fallbackFullscreenActive = false;

export function wireFullscreenEvents() {
  dom.pageFullscreenButton.addEventListener("click", () => {
    togglePageFullscreen();
  });

  wirePlayerOverlayControls();
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !fallbackFullscreenActive) return;
    event.preventDefault();
    fallbackFullscreenActive = false;
    handleFullscreenChange();
  });

  dom.videoPlayer.addEventListener("dblclick", (event) => {
    event.preventDefault();
    togglePageFullscreen();
  });

  dom.videoPlayer.addEventListener("webkitbeginfullscreen", () => {
    togglePageFullscreen();
  });

  let scrollSnapTimer = null;
  window.addEventListener("scroll", () => {
    const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
    if (isPageFullscreenActive() || !isBottomDock) return;

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      if (dom.sessionView?.classList.contains("chat-scroll-snap-locked")) return;
      snapFullscreenScroll();
    }, FULLSCREEN_SNAP_DELAY_MS);
  }, { passive: true });

  window.addEventListener("resize", syncInsideChatPanelOffset, { passive: true });
}

let hideTimer = null;

function wirePlayerOverlayControls() {
  if (!dom.playerFrame || !dom.pageFullscreenButton) return;

  const setOverlayVisible = (isVisible) => {
    dom.playerFrame.classList.toggle("player-overlay-visible", isVisible);
  };

  const clearHideTimer = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const scheduleHide = (delay = PLAYER_OVERLAY_IDLE_MS) => {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      setOverlayVisible(false);
    }, delay);
  };

  const revealOverlay = (event) => {
    if (event?.type === "focusin" && dom.playerFrame.dataset.suppressOverlayFocus === "1") {
      delete dom.playerFrame.dataset.suppressOverlayFocus;
      return;
    }
    setOverlayVisible(true);
    scheduleHide();
  };

  // Al mover o clickear el mouse en el player frame, se muestra el overlay
  dom.playerFrame.addEventListener("mousemove", revealOverlay, { passive: true });
  dom.playerFrame.addEventListener("mousedown", revealOverlay, { passive: true });
  dom.playerFrame.addEventListener("touchstart", revealOverlay, { passive: true });

  dom.playerFrame.addEventListener("mouseenter", revealOverlay);
  dom.playerFrame.addEventListener("focusin", revealOverlay);

  dom.playerFrame.addEventListener("mouseleave", () => {
    // El input del chat puede seguir enfocado aunque el cursor salga del video.
    // Solo quitamos el foco de controles del reproductor para no interrumpir la escritura.
    const activeElement = document.activeElement;
    if (
      activeElement &&
      dom.playerFrame.contains(activeElement) &&
      !dom.playerChat?.contains(activeElement)
    ) {
      activeElement.blur();
    }
    scheduleHide(400);
  });
  dom.playerFrame.addEventListener("focusout", () => {
    scheduleHide(800);
  });

  dom.videoPlayer.addEventListener("play", () => {
    scheduleHide();
  });
  dom.videoPlayer.addEventListener("pause", revealOverlay);
  dom.videoPlayer.addEventListener("loadedmetadata", revealOverlay);
  dom.videoPlayer.addEventListener("emptied", revealOverlay);

  revealOverlay();
}

function isPageFullscreenActive() {
  return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
}

function getDocumentTop(element) {
  if (!element) return 0;
  return Math.round(element.getBoundingClientRect().top + window.scrollY);
}

function getFullscreenSnapPoints() {
  const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
  if (!isBottomDock || isPageFullscreenActive() || !dom.workspace) return [];

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const gutter = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--app-shell-gutter"),
  ) || 0;
  const points = [getDocumentTop(dom.workspace)];

  if (dock === "bottom" && dom.videoArea) {
    points.push(getDocumentTop(dom.videoArea) - gutter);
  }

  if (!collapsed) {
    if (dock === "bottom" && dom.chatArea) {
      points.push(getDocumentTop(dom.chatArea) - gutter);
    }
    if (dock === "top" && dom.videoArea) {
      points.push(getDocumentTop(dom.videoArea));
    }
  }

  return Array.from(new Set(points))
    .filter((point) => point >= 0)
    .filter((point) => Math.abs(maxScroll - point) > FULLSCREEN_END_GAP)
    .sort((a, b) => a - b);
}

export function snapFullscreenScroll() {
  const points = getFullscreenSnapPoints();
  if (!points.length) return;

  const currentY = window.scrollY;
  let closestPoint = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point) => {
    const distance = Math.abs(point - currentY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPoint = point;
    }
  });

  if (closestPoint == null || closestDistance < 2 || closestDistance > FULLSCREEN_SNAP_THRESHOLD) {
    return;
  }

  window.scrollTo({
    top: closestPoint,
    behavior: "smooth",
  });
}

export async function togglePageFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (fallbackFullscreenActive) {
      fallbackFullscreenActive = false;
      handleFullscreenChange();
      return;
    }

    if (document.fullscreenEnabled && typeof document.documentElement?.requestFullscreen === "function") {
      await document.documentElement.requestFullscreen();
    } else {
      fallbackFullscreenActive = true;
      handleFullscreenChange();
    }
  } catch (error) {
    console.error(error);
    logEvent("error", `No se pudo activar pantalla completa: ${error.message || error}`);
    fallbackFullscreenActive = true;
    handleFullscreenChange();
    setSyncStatus("Modo pantalla activado sin fullscreen del navegador.");
  }
}

export function handleFullscreenChange() {
  const isFullscreen = Boolean(document.fullscreenElement) || fallbackFullscreenActive;
  const icon = dom.pageFullscreenButton.querySelector("[data-lucide]");
  const tooltip = withShortcutHint(
    isFullscreen ? "Salir de pantalla completa" : "Pantalla completa",
    "F",
  );

  document.documentElement.classList.toggle("fullscreen-mode", isFullscreen);
  document.body.classList.toggle("fullscreen-mode", isFullscreen);
  dom.pageFullscreenButton.classList.toggle("active", isFullscreen);
  dom.pageFullscreenButton.dataset.tooltip = tooltip;
  dom.pageFullscreenButton.removeAttribute("title");
  dom.pageFullscreenButton.setAttribute("aria-label", tooltip);
  if (icon) {
    icon.setAttribute("data-lucide", isFullscreen ? "minimize" : "maximize");
    icon.innerHTML = "";
  }
  hydrateIcons();
  if (isFullscreen) focusFullscreenWorkspace();
  syncInsideChatPanelOffset();
  logEvent("ui", isFullscreen ? "Pantalla completa de pagina activada." : "Pantalla completa desactivada.");
}

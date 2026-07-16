import {
  dom,
} from "../core/dom.js";
import {
  FULLSCREEN_END_GAP,
  FULLSCREEN_SNAP_DELAY_MS,
  FULLSCREEN_SNAP_THRESHOLD,
} from "../core/utils.js";
import {
  hydrateIcons,
} from "./ui.js";
import { focusFullscreenWorkspace, setSyncStatus } from "./session-ui.js";
import {
  logEvent,
} from "../core/state.js";

export function wireFullscreenEvents() {
  dom.pageFullscreenButton.addEventListener("click", () => {
    togglePageFullscreen();
  });

  document.addEventListener("fullscreenchange", handleFullscreenChange);

  dom.videoPlayer.addEventListener("dblclick", (event) => {
    event.preventDefault();
    togglePageFullscreen();
  });

  dom.videoPlayer.addEventListener("webkitbeginfullscreen", () => {
    togglePageFullscreen();
  });

  let scrollSnapTimer = null;
  window.addEventListener("scroll", () => {
    if (!document.body.classList.contains("fullscreen-mode") && !document.fullscreenElement) return;

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      snapFullscreenScroll();
    }, FULLSCREEN_SNAP_DELAY_MS);
  }, { passive: true });
}

function isPageFullscreenActive() {
  return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
}

function getDocumentTop(element) {
  if (!element) return 0;
  return Math.round(element.getBoundingClientRect().top + window.scrollY);
}

function getFullscreenSnapPoints() {
  if (!isPageFullscreenActive() || !dom.workspace) return [];

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const points = [getDocumentTop(dom.workspace)];

  if (!collapsed) {
    if (dock === "bottom" && dom.chatArea) {
      points.push(getDocumentTop(dom.chatArea));
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

    if (document.body.classList.contains("fullscreen-mode")) {
      document.body.classList.remove("fullscreen-mode");
      handleFullscreenChange();
      return;
    }

    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else {
      document.body.classList.toggle("fullscreen-mode");
      handleFullscreenChange();
    }
  } catch (error) {
    console.error(error);
    logEvent("error", `No se pudo activar pantalla completa: ${error.message || error}`);
    document.body.classList.add("fullscreen-mode");
    handleFullscreenChange();
    setSyncStatus("Modo pantalla activado sin fullscreen del navegador.");
  }
}

export function handleFullscreenChange() {
  if (document.fullscreenElement === dom.videoPlayer) {
    document.exitFullscreen().catch(() => {});
    document.body.classList.add("fullscreen-mode");
  }

  if (!document.fullscreenElement) {
    document.body.classList.remove("fullscreen-mode");
  }

  const isFullscreen = Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
  const icon = dom.pageFullscreenButton.querySelector("[data-lucide]");

  document.documentElement.classList.toggle("fullscreen-mode", isFullscreen);
  document.body.classList.toggle("fullscreen-mode", isFullscreen);
  dom.pageFullscreenButton.classList.toggle("active", isFullscreen);
  dom.pageFullscreenButton.dataset.tooltip = isFullscreen ? "Salir de pantalla completa" : "Pantalla completa con controles visibles";
  dom.pageFullscreenButton.removeAttribute("title");
  dom.pageFullscreenButton.setAttribute("aria-label", dom.pageFullscreenButton.dataset.tooltip);
  if (icon) {
    icon.setAttribute("data-lucide", isFullscreen ? "minimize" : "maximize");
    icon.innerHTML = "";
  }
  hydrateIcons();
  if (isFullscreen) focusFullscreenWorkspace();
  logEvent("ui", isFullscreen ? "Pantalla completa de pagina activada." : "Pantalla completa desactivada.");
}

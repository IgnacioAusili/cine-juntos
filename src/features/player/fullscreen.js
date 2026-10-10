import {
  dom,
} from "../../core/dom.js?v=20261010-file-size-refactor-02";
import {
  FULLSCREEN_END_GAP,
  FULLSCREEN_SNAP_DELAY_MS,
  FULLSCREEN_SNAP_THRESHOLD,
} from "../../core/utils.js?v=20261010-file-size-refactor-02";
import {
  hideTooltip,
  setControlIcon,
} from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { setSyncStatus } from "../session-ui.js?v=20261010-file-size-refactor-02";
import {
  logEvent,
  state,
} from "../../core/state.js?v=20261010-file-size-refactor-02";
import { isMiniPlayerActive } from "./mini-player.js?v=20261010-file-size-refactor-02";
import { wirePlayerOverlayControls } from "./player-overlay-controls.js?v=20261010-file-size-refactor-02";
import {
  syncExternalChatCollapseHandleOffset,
  syncInsideChatPanelOffset,
  cancelExternalChatAutoCollapse,
  forceExternalChatCollapsed,
  updateCollapseButton,
} from "../chat/chat-layout.js?v=20261010-file-size-refactor-02";
import { withShortcutHint } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import {
  captureFullscreenScroll,
  restoreFullscreenScroll,
} from "./fullscreen-scroll.js?v=20261010-file-size-refactor-02";

const PLAYER_OVERLAY_IDLE_MS = 3000;
const PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS = 800;
const MOBILE_OVERLAY_TOGGLE_LOCK_MS = 320;
const MOBILE_PLAYER_MEDIA_QUERY = "(max-width: 980px) and (hover: none) and (pointer: coarse)";
let fallbackFullscreenActive = false;

const USE_NATIVE_FULLSCREEN = true;

function getFullscreenScrollContainer() {
  return dom.sessionView?.closest(".app-shell") || document.scrollingElement || document.documentElement;
}

function getFullscreenScrollTop() {
  if (!isPageFullscreenActive()) return window.scrollY;
  return Math.round(getFullscreenScrollContainer().scrollTop || 0);
}

function getFullscreenScrollMax() {
  if (!isPageFullscreenActive()) {
    return Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  }

  const container = getFullscreenScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
}

function getFullscreenViewportHeight() {
  if (isPageFullscreenActive()) {
    const containerHeight = getFullscreenScrollContainer()?.clientHeight || 0;
    if (containerHeight > 0) return containerHeight;
  }
  return window.visualViewport?.height || window.innerHeight;
}

function getElementScrollTop(element) {
  if (!element) return 0;
  if (!isPageFullscreenActive()) {
    return Math.round(element.getBoundingClientRect().top + window.scrollY);
  }

  const container = getFullscreenScrollContainer();
  const containerRect = container.getBoundingClientRect();
  return Math.round(
    element.getBoundingClientRect().top - containerRect.top + (container.scrollTop || 0),
  );
}

export function wireFullscreenEvents(options = {}) {
  dom.pageFullscreenButton.addEventListener("click", () => {
    togglePageFullscreen();
  });

  wirePlayerOverlayControls(options);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !fallbackFullscreenActive) return;
    event.preventDefault();
    fallbackFullscreenActive = false;
    handleFullscreenChange();
  });

  dom.videoPlayer.addEventListener("dblclick", (event) => {
    if (isMiniPlayerActive()) return;
    event.preventDefault();
    togglePageFullscreen();
  });

  let scrollSnapTimer = null;
  const handleFullscreenScroll = () => {
    if (!isChatScrollSnapEnabled()) {
      if (scrollSnapTimer) {
        window.clearTimeout(scrollSnapTimer);
        scrollSnapTimer = null;
      }
      return;
    }
    if (fullscreenScrollPreservationUntil > performance.now()) return;

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      scrollSnapTimer = null;
      if (fullscreenScrollPreservationUntil > performance.now()) return;
      if (
        dom.sessionView?.dataset.chatDock !== "bottom"
        || dom.sessionView?.classList.contains("chat-scroll-snap-locked")
      ) return;
      snapFullscreenScroll();
    }, FULLSCREEN_SNAP_DELAY_MS);
  };

  window.addEventListener("scroll", handleFullscreenScroll, { passive: true });
  getFullscreenScrollContainer()?.addEventListener("scroll", handleFullscreenScroll, { passive: true });

  window.addEventListener("resize", syncInsideChatPanelOffset, { passive: true });
}

let fullscreenScrollPreservationUntil = 0;

function isPageFullscreenActive() {
  return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
}

function isChatScrollSnapEnabled() {
  return dom.sessionView?.dataset.chatDock === "bottom"
    && dom.sessionView.classList.contains("chat-bottom-snap-enabled");
}

function getDocumentTop(element) {
  return getElementScrollTop(element);
}

function getFullscreenSnapPoints() {
  if (!isChatScrollSnapEnabled() || !dom.workspace) return [];

  const maxScroll = getFullscreenScrollMax();
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const gutter = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--app-shell-gutter"),
  ) || 0;
  const points = [getDocumentTop(dom.workspace)];

  if (dock === "bottom" && dom.videoArea) {
    const videoTop = getDocumentTop(dom.videoArea);
    const videoHeight = dom.videoArea.getBoundingClientRect().height;
    const viewportHeight = getFullscreenViewportHeight();
    // Centrar desde las medidas reales mantiene márgenes iguales aunque el
    // layout ajuste el panel por el header, el gutter o el aspect ratio.
    const videoCenterPoint = Math.round(videoTop + (videoHeight - viewportHeight) / 2);
    const nearbyWorkspacePointIndex = points.findIndex(
      (point) => Math.abs(point - videoCenterPoint) <= FULLSCREEN_SNAP_THRESHOLD,
    );
    if (nearbyWorkspacePointIndex >= 0) {
      // El inicio del workspace y el centro del video pueden quedar a pocos
      // píxeles; el ancla centrada debe ganar en ese caso.
      points[nearbyWorkspacePointIndex] = videoCenterPoint;
    } else {
      points.push(videoCenterPoint);
    }
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
  if (!isChatScrollSnapEnabled()) return;

  const points = getFullscreenSnapPoints();
  if (!points.length) return;

  const currentY = getFullscreenScrollTop();
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

  // El snap conserva el anclaje y acompaña suavemente el desplazamiento de la
  // rueda, igual que los demás movimientos programáticos de la interfaz.
  if (isPageFullscreenActive()) {
    getFullscreenScrollContainer().scrollTo({
      top: closestPoint,
      behavior: "smooth",
    });
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
      captureFullscreenScroll(false);
      await document.exitFullscreen();
      return;
    }

    if (fallbackFullscreenActive) {
      captureFullscreenScroll(false);
      fallbackFullscreenActive = false;
      handleFullscreenChange();
      return;
    }

    const isMobilePlayer = window.matchMedia(MOBILE_PLAYER_MEDIA_QUERY).matches;
    // En móviles el workspace es el destino nativo: contiene el reproductor y
    // el chat, por lo que la flecha sigue dentro de la superficie fullscreen
    // y se puede tocar para desplegarlo. Si el navegador no ofrece la API,
    // queda el fallback visual.
    const fullscreenTarget = isMobilePlayer
      ? dom.workspace || dom.playerFrame || dom.videoPlayer
      : dom.sessionView?.closest(".app-shell")
        || dom.sessionView
        || document.documentElement;
    if (USE_NATIVE_FULLSCREEN && document.fullscreenEnabled && typeof fullscreenTarget?.requestFullscreen === "function") {
      captureFullscreenScroll(true);
      await fullscreenTarget.requestFullscreen({ navigationUI: "hide" });
    } else {
      captureFullscreenScroll(true);
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
  captureFullscreenScroll(isFullscreen);
  fullscreenScrollPreservationUntil = performance.now() + FULLSCREEN_SNAP_DELAY_MS + 80;
  const tooltip = withShortcutHint(
    isFullscreen ? "Salir de pantalla completa" : "Pantalla completa",
    "F",
  );

  document.documentElement.classList.toggle("fullscreen-mode", isFullscreen);
  document.body.classList.toggle("fullscreen-mode", isFullscreen);
  if (
    isFullscreen
    && dom.sessionView?.dataset.chatDock === "bottom"
    && window.matchMedia("(max-width: 980px) and (orientation: landscape)").matches
  ) {
    cancelExternalChatAutoCollapse();
    forceExternalChatCollapsed();
  }
  updateCollapseButton();
  dom.pageFullscreenButton.classList.toggle("active", isFullscreen);
  dom.pageFullscreenButton.dataset.tooltip = tooltip;
  dom.pageFullscreenButton.removeAttribute("title");
  dom.pageFullscreenButton.setAttribute("aria-label", tooltip);
  setControlIcon(dom.pageFullscreenButton, isFullscreen ? "minimize" : "maximize");
  const fullscreenVideoScrollTop = isFullscreen
    && dom.sessionView?.dataset.chatDock === "bottom"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches
    && dom.videoArea
    ? getDocumentTop(dom.videoArea)
    : null;
  restoreFullscreenScroll(isFullscreen, fullscreenVideoScrollTop);
  syncInsideChatPanelOffset();
  // El fullscreen cambia el origen y las filas del layout móvil. Recalcular
  // también el anclaje del control externo evita que la flecha del chat
  // inferior conserve el offset del viewport anterior y quede fuera de la
  // pantalla al entrar en fullscreen.
  syncExternalChatCollapseHandleOffset();
  window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);
  logEvent("ui", isFullscreen ? "Pantalla completa de pagina activada." : "Pantalla completa desactivada.");
}

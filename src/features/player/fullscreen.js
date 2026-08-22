import {
  dom,
} from "../../core/dom.js";
import {
  FULLSCREEN_END_GAP,
  FULLSCREEN_SNAP_DELAY_MS,
  FULLSCREEN_SNAP_THRESHOLD,
} from "../../core/utils.js";
import {
  hideTooltip,
  hydrateIcons,
} from "../icons-tooltips.js";
import { focusFullscreenWorkspace, setSyncStatus } from "../session-ui.js";
import {
  logEvent,
} from "../../core/state.js";
import { isMiniPlayerActive } from "./mini-player.js?v=20260815-seek-tooltip-01";
import { syncInsideChatPanelOffset } from "../chat/chat-layout.js?v=20260811-text-stable-motion-01";
import { withShortcutHint } from "../../core/utils.js";
import { wireTouchHover } from "../../core/touch-interactions.js";

const PLAYER_OVERLAY_IDLE_MS = 2200;
const PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS = 650;
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
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  const container = getFullscreenScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
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
    if (isMiniPlayerActive()) return;
    event.preventDefault();
    togglePageFullscreen();
  });

  dom.videoPlayer.addEventListener("webkitbeginfullscreen", () => {
    togglePageFullscreen();
  });

  let scrollSnapTimer = null;
  const handleFullscreenScroll = () => {
    const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
    if (!isBottomDock) {
      if (!isBottomDock && scrollSnapTimer) {
        window.clearTimeout(scrollSnapTimer);
        scrollSnapTimer = null;
      }
      return;
    }

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      scrollSnapTimer = null;
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

let hideTimer = null;

function wirePlayerOverlayControls() {
  if (!dom.playerFrame || !dom.pageFullscreenButton) return;

  const chatCollapseHoverZone = dom.collapseChatButton?.closest(".chat-collapse-hover-zone");

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
      hideTooltip();
      if (document.activeElement === dom.playerRateSelect) {
        dom.playerRateSelect.blur();
      }
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-cursor-hidden");
    }, delay);
  };

  const revealOverlayFromChatHandle = () => {
    clearHideTimer();
    dom.playerFrame.classList.remove("player-cursor-hidden");
    setOverlayVisible(true);
    scheduleHide();
  };

  const revealOverlay = (event) => {
    dom.playerFrame.classList.remove("player-cursor-hidden");

    if (event?.type === "focusin" && dom.playerFrame.dataset.suppressOverlayFocus === "1") {
      delete dom.playerFrame.dataset.suppressOverlayFocus;
      return;
    }

    const target = event?.target instanceof Element ? event.target : null;
    const isChatToggle = target?.closest("#playerChatToggleButton");
    if (event?.type === "focusin" && dom.playerFrame.dataset.suppressOverlayFocus === "chat-toggle") {
      return;
    }
    if (event?.type === "mousedown" && isChatToggle
      && !dom.playerFrame.classList.contains("player-overlay-visible")) {
      dom.playerFrame.dataset.suppressOverlayFocus = "chat-toggle";
      window.setTimeout(() => {
        if (dom.playerFrame?.dataset.suppressOverlayFocus === "chat-toggle") {
          delete dom.playerFrame.dataset.suppressOverlayFocus;
        }
      }, 500);
      return;
    }
    const isChatInteraction = target?.closest(".player-chat")
      && !dom.playerChatToggleButton?.matches(":hover");
    // Al abrir el chat, el foco pasa automáticamente a su textarea. Ese
    // focusin burbujea hasta el playerFrame y no debe interpretarse como una
    // interacción con el video. Mientras el puntero siga sobre el overlay,
    // tampoco dejamos que un movimiento o una pulsación vuelva a revelarla.
    if (isChatInteraction) {
      clearHideTimer();
      dom.playerFrame.classList.add("player-overlay-suppressed");
      setOverlayVisible(false);
      scheduleHide();
      return;
    }

    dom.playerFrame.classList.remove("player-overlay-suppressed");
    setOverlayVisible(true);
    scheduleHide();
  };

  // En táctil, la barra del reproductor se comporta como un hover: aparece
  // solo mientras se mantiene la pulsación y se limpia al soltar.
  wireTouchHover(dom.playerFrame, {
    onActivate: (event) => {
      // El chat vive dentro del playerFrame, pero sus pulsaciones no son una
      // interacción con el video. En móvil no revelar la barra al mantener
      // presionado un mensaje, el input o cualquier control del overlay.
      if (event?.target?.closest?.(".player-chat")) {
        clearHideTimer();
        dom.playerFrame.classList.add("player-overlay-suppressed");
        setOverlayVisible(false);
        return;
      }

      clearHideTimer();
      dom.playerFrame.classList.remove("player-cursor-hidden");
      dom.playerFrame.classList.remove("player-overlay-suppressed");
      setOverlayVisible(true);
    },
    onDeactivate: () => scheduleHide(0),
  });

  // Al mover o clickear el mouse en el player frame, se muestra el overlay
  dom.playerFrame.addEventListener("mousemove", revealOverlay, { passive: true });
  dom.playerFrame.addEventListener("mousedown", revealOverlay, { passive: true });

  // pointerenter ocurre antes que mouseenter. Quitar aquí el cursor oculto
  // evita que parpadee o desaparezca un instante al volver al reproductor.
  dom.playerFrame.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    clearHideTimer();
    dom.playerFrame.classList.remove("player-cursor-hidden");
  }, { passive: true, capture: true });

  dom.playerFrame.addEventListener("mouseenter", revealOverlay);
  dom.playerFrame.addEventListener("focusin", revealOverlay);

  dom.playerFrame.addEventListener("mouseleave", (event) => {
    // El control de contraer/expandir queda visualmente en la union del video
    // y el chat, aunque su nodo no sea hijo del player. Mientras el cursor
    // entra en esa zona seguimos considerando activo el overlay del video.
    if (
      chatCollapseHoverZone?.matches(":hover")
      || chatCollapseHoverZone?.contains(event.relatedTarget)
    ) {
      revealOverlayFromChatHandle();
      return;
    }

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
    // Darle un margen al cursor para volver al reproductor. Si vuelve antes
    // de este plazo, revealOverlay cancela este ocultamiento y reinicia el
    // contador normal de la barra.
    scheduleHide(PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS);
  });

  chatCollapseHoverZone?.addEventListener("mouseenter", revealOverlayFromChatHandle);
  chatCollapseHoverZone?.addEventListener("mousemove", revealOverlayFromChatHandle, { passive: true });
  chatCollapseHoverZone?.addEventListener("mousedown", revealOverlayFromChatHandle, { passive: true });
  chatCollapseHoverZone?.addEventListener("mouseleave", () => {
    scheduleHide(PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS);
  });
  wireTouchHover(chatCollapseHoverZone, {
    onActivate: revealOverlayFromChatHandle,
    onDeactivate: () => scheduleHide(0),
  });

  // Ajustar el volumen con la rueda tambien mantiene activa la barra. Se
  // escucha en captura para cubrir el caso en que el evento termine sobre el
  // reproductor por el pointer-events del overlay oculto.
  document.addEventListener("wheel", (event) => {
    if (event.target?.closest?.(".mini-player-surface")) return;
    const volumeGroup = dom.playerVolumeGroup;
    if (!volumeGroup) return;

    const isInsideVolumeGroup = event.target instanceof Node && volumeGroup.contains(event.target);
    const rect = volumeGroup.getBoundingClientRect();
    const isOverVolumeGroup = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;

    if (isInsideVolumeGroup || isOverVolumeGroup) {
      revealOverlay(event);
    }
  }, { passive: true, capture: true });

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
  return getElementScrollTop(element);
}

function getFullscreenSnapPoints() {
  const isBottomDock = dom.sessionView?.dataset.chatDock === "bottom";
  if (!isBottomDock || !dom.workspace) return [];

  const maxScroll = getFullscreenScrollMax();
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
  if (dom.sessionView?.dataset.chatDock !== "bottom") return;

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

  // El snap conserva el anclaje, pero no agrega otra animación a la rueda.
  // El desplazamiento explícito de expandir el chat sí usa smooth más abajo.
  if (isPageFullscreenActive()) {
    getFullscreenScrollContainer().scrollTo({
      top: closestPoint,
      behavior: "auto",
    });
    return;
  }

  window.scrollTo({
    top: closestPoint,
    behavior: "auto",
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

    const fullscreenTarget = dom.sessionView?.closest(".app-shell")
      || dom.sessionView
      || document.documentElement;
    if (USE_NATIVE_FULLSCREEN && document.fullscreenEnabled && typeof fullscreenTarget?.requestFullscreen === "function") {
      // La app completa conserva la cabecera de la sala dentro del fullscreen,
      // pero el contenedor se ajusta por inset en lugar de heredar el alto
      // previo del <html> durante la transicion de Chrome.
      await fullscreenTarget.requestFullscreen({ navigationUI: "hide" });
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

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
import { setSyncStatus } from "../session-ui.js?v=20260902-stable-page-viewport-01";
import {
  logEvent,
  state,
} from "../../core/state.js";
import { isMiniPlayerActive } from "./mini-player.js?v=20260902-video-scroll-touch-02";
import { syncInsideChatPanelOffset } from "../chat/chat-layout.js?v=20260902-chat-landscape-handle-settle-01";
import { withShortcutHint } from "../../core/utils.js";
import {
  captureFullscreenScroll,
  restoreFullscreenScroll,
} from "./fullscreen-scroll.js";

const PLAYER_OVERLAY_IDLE_MS = 3000;
const PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS = 800;
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

  dom.videoPlayer.addEventListener("webkitbeginfullscreen", () => {
    togglePageFullscreen();
  });

  let scrollSnapTimer = null;
  const handleFullscreenScroll = () => {
    if (fullscreenScrollPreservationUntil > performance.now()) return;
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

let hideTimer = null;
let fullscreenScrollPreservationUntil = 0;

function wirePlayerOverlayControls({ togglePlayback } = {}) {
  if (!dom.playerFrame || !dom.pageFullscreenButton) return;

  const isInlinePlayerDialogVisible = () => Boolean(
    dom.resumeVideoPopup && !dom.resumeVideoPopup.hidden,
  );

  const setOverlayVisible = (isVisible) => {
    dom.playerFrame.classList.toggle("player-overlay-visible", isVisible);
  };

  const clearHideTimer = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const isMobileTouchDevice = () => window.matchMedia(MOBILE_PLAYER_MEDIA_QUERY).matches;
  const keepOverlayWhilePaused = () => isMobileTouchDevice()
    && (dom.videoPlayer.paused || dom.videoPlayer.ended);

  const scheduleHide = (delay = PLAYER_OVERLAY_IDLE_MS) => {
    clearHideTimer();
    if (keepOverlayWhilePaused()) return;
    const safeDelay = delay > 0 ? delay : PLAYER_OVERLAY_IDLE_MS;
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (isInlinePlayerDialogVisible()) return;
      if (keepOverlayWhilePaused()) return;
      if (state.ui.seekDragActive) {
        scheduleHide(safeDelay);
        return;
      }
      if (dom.playerFrame.classList.contains("player-seek-control-dragging")) {
        scheduleHide(safeDelay);
        return;
      }
      if (dom.playerFrame.classList.contains("player-volume-gesture-active")) {
        scheduleHide(safeDelay);
        return;
      }
      if (
        dom.playerVolumeGroup?.classList.contains("is-dragging")
        || volumeControlPointerActive
        || dom.playerVolumeInput?.matches(":active")
      ) {
        scheduleHide(safeDelay);
        return;
      }
      hideTooltip();
      if (document.activeElement === dom.playerRateSelect) {
        dom.playerRateSelect.blur();
      }
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-cursor-hidden");
    }, safeDelay);
  };

  const resetHideTimerAfterControlClick = (event) => {
    const control = event.target?.closest?.("button");
    const isPlayerControl = dom.playerBottomActions?.contains(control)
      || dom.playerCenterActions?.contains(control);
    if (!control || !isPlayerControl || control.disabled) return;
    if (isInlinePlayerDialogVisible()) return;

    scheduleHide();
  };

  [dom.playerBottomActions, dom.playerCenterActions]
    .filter(Boolean)
    .forEach((controls) => controls.addEventListener("click", resetHideTimerAfterControlClick));

  const isTouchPointer = (event) => event?.pointerType === "touch" || event?.pointerType === "pen";
  const VIDEO_GESTURE_MOVE_THRESHOLD = 10;
  const supportsPointerEvents = "PointerEvent" in window;
  let lastTouchPointerAt = 0;
  let videoClickTimer = null;
  let activeVideoTouchGesture = null;
  const trackVideoTouchStart = (event) => {
    if (
      event.target !== dom.videoPlayer
      || !isMobileTouchDevice()
      || !isTouchPointer(event)
    ) return;

    activeVideoTouchGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };
  const trackVideoTouchMove = (event) => {
    if (!activeVideoTouchGesture || event.pointerId !== activeVideoTouchGesture.pointerId) return;
    if (
      Math.hypot(
        event.clientX - activeVideoTouchGesture.startX,
        event.clientY - activeVideoTouchGesture.startY,
      ) >= VIDEO_GESTURE_MOVE_THRESHOLD
    ) {
      activeVideoTouchGesture.moved = true;
    }
  };
  const finishVideoTouchGesture = (event) => {
    if (!activeVideoTouchGesture || event.pointerId !== activeVideoTouchGesture.pointerId) return false;
    const moved = activeVideoTouchGesture.moved;
    activeVideoTouchGesture = null;
    if (moved || event.target !== dom.videoPlayer) lastTouchPointerAt = Date.now();
    return moved;
  };
  const toggleOverlayFromVideo = (event) => {
    if (
      event?.target !== dom.videoPlayer
      || dom.videoPlayer.closest(".mini-player-surface")
      || !isMobileTouchDevice()
    ) return;

    if (event.defaultPrevented) {
      lastTouchPointerAt = Date.now();
      return;
    }

    event.preventDefault();
    lastTouchPointerAt = Date.now();
    clearHideTimer();
    const isVisible = dom.playerFrame.classList.contains("player-overlay-visible");
    if (isVisible) {
      hideTooltip();
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-cursor-hidden");
      return;
    }

    dom.playerFrame.classList.remove("player-cursor-hidden");
    setOverlayVisible(true);
    scheduleHide();
  };
  dom.videoPlayer.addEventListener("pointerdown", trackVideoTouchStart, { passive: true });
  window.addEventListener("pointermove", trackVideoTouchMove, { passive: true });
  dom.videoPlayer.addEventListener("pointerup", (event) => {
    if (!isTouchPointer(event)) return;
    if (finishVideoTouchGesture(event)) return;
    toggleOverlayFromVideo(event);
  }, { passive: false });
  document.addEventListener("pointerup", (event) => {
    if (!isTouchPointer(event)) return;
    finishVideoTouchGesture(event);
  }, { passive: true });
  document.addEventListener("pointercancel", (event) => {
    if (!isTouchPointer(event)) return;
    activeVideoTouchGesture = null;
  }, { passive: true });
  if (!supportsPointerEvents) {
    let activeLegacyTouchGesture = null;
    const getLegacyTouchPoint = (event) => {
      const touch = event.changedTouches?.[0];
      return touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
    };
    dom.videoPlayer.addEventListener("touchstart", (event) => {
      if (!isMobileTouchDevice() || event.target !== dom.videoPlayer) return;
      const point = getLegacyTouchPoint(event);
      if (!point) return;
      activeLegacyTouchGesture = { ...point, moved: false };
    }, { passive: true });
    dom.videoPlayer.addEventListener("touchmove", (event) => {
      if (!activeLegacyTouchGesture) return;
      const point = getLegacyTouchPoint(event);
      if (!point || point.id !== activeLegacyTouchGesture.id) return;
      if (
        Math.hypot(
          point.x - activeLegacyTouchGesture.x,
          point.y - activeLegacyTouchGesture.y,
        ) >= VIDEO_GESTURE_MOVE_THRESHOLD
      ) {
        activeLegacyTouchGesture.moved = true;
      }
    }, { passive: true });
    dom.videoPlayer.addEventListener("touchend", (event) => {
      if (!activeLegacyTouchGesture) return;
      const moved = activeLegacyTouchGesture.moved;
      activeLegacyTouchGesture = null;
      if (moved) {
        lastTouchPointerAt = Date.now();
        return;
      }
      toggleOverlayFromVideo(event);
    }, { passive: false });
    dom.videoPlayer.addEventListener("touchcancel", () => {
      activeLegacyTouchGesture = null;
    }, { passive: true });
  }
  dom.videoPlayer.addEventListener("click", (event) => {
    if (event.target !== dom.videoPlayer) return;
    if (isMobileTouchDevice()) {
      if (Date.now() - lastTouchPointerAt <= 600) {
        event.preventDefault();
        return;
      }
      if (event.pointerType !== "mouse") toggleOverlayFromVideo(event);
      return;
    }

    if (typeof togglePlayback !== "function") return;
    if (videoClickTimer) window.clearTimeout(videoClickTimer);
    videoClickTimer = window.setTimeout(() => {
      videoClickTimer = null;
      togglePlayback();
    }, 220);
  });
  dom.videoPlayer.addEventListener("dblclick", () => {
    if (!videoClickTimer) return;
    window.clearTimeout(videoClickTimer);
    videoClickTimer = null;
  });

  // El input range puede perder la captura al salir de la barra durante el
  // arrastre. Mantener este estado en captura evita que ese detalle del
  // navegador permita ocultar los controles antes de soltar el volumen.
  let volumeControlPointerActive = false;
  let suppressChatToggleOverlayUntil = 0;
  const isVolumeControlTarget = (target) =>
    target instanceof Element && Boolean(target.closest(".player-volume-slider-wrap"));
  const keepVolumeControlsDuringDrag = (event) => {
    if (!isVolumeControlTarget(event.target)) return;
    volumeControlPointerActive = true;
    clearHideTimer();
    dom.playerFrame.classList.remove("player-cursor-hidden");
    dom.playerFrame.classList.add("player-volume-control-dragging");
    setOverlayVisible(true);
  };
  const finishVolumeControlDrag = (event) => {
    if (!volumeControlPointerActive) return;
    volumeControlPointerActive = false;
    dom.playerVolumeGroup?.classList.remove("is-dragging");
    dom.playerFrame.classList.remove("player-volume-control-dragging");
    scheduleHide();
  };
  document.addEventListener("pointerdown", keepVolumeControlsDuringDrag, true);
  document.addEventListener("pointerup", finishVolumeControlDrag, true);
  document.addEventListener("pointercancel", finishVolumeControlDrag, true);
  document.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType !== "mouse"
      && event.target instanceof Element
      && event.target.closest("#playerChatToggleButton")
    ) {
      suppressChatToggleOverlayUntil = Date.now() + 600;
      clearHideTimer();
    }
  }, true);

  const revealOverlay = (event) => {
    if (isInlinePlayerDialogVisible()) return;

    if (event?.type === "focusin" && dom.playerFrame.dataset.suppressOverlayFocus === "1") {
      delete dom.playerFrame.dataset.suppressOverlayFocus;
      return;
    }

    const target = event?.target instanceof Element ? event.target : null;
    const isChatToggle = target?.closest("#playerChatToggleButton");
    // El botón del chat es una acción independiente del reproductor: no debe
    // cambiar la visibilidad de la barra ni provocar el estado suprimido.
    if (isChatToggle || Date.now() < suppressChatToggleOverlayUntil) return;
    if (
      isMobileTouchDevice()
      && target === dom.videoPlayer
      && (event?.type === "mousedown" || event?.type === "mouseenter")
    ) return;
    dom.playerFrame.classList.remove("player-cursor-hidden");
    if (
      target === dom.videoPlayer
      && dom.playerFrame.classList.contains("player-overlay-suppressed")
    ) return;
    // En PC un clic sobre el video conserva el comportamiento anterior de
    // alternar la reproducción; este bloque solo evita revelar el overlay al
    // iniciar la pausa.
    if (
      event?.type === "mousedown"
      && target === dom.videoPlayer
      && !isMobileTouchDevice()
    ) {
      if (!dom.videoPlayer.paused && !dom.videoPlayer.ended) return;
      clearHideTimer();
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-overlay-suppressed");
      window.setTimeout(() => {
        dom.playerFrame.classList.remove("player-overlay-suppressed");
      }, 700);
      return;
    }
    const isChatInteraction = target?.closest(".player-chat")
      && !dom.playerChatToggleButton?.matches(":hover");
    if (isChatInteraction && isMobileTouchDevice()) return;
    // Al abrir el chat, el foco pasa automáticamente a su textarea. Ese
    // focusin burbujea hasta el playerFrame y no debe interpretarse como una
    // interacción con el video. Mientras el puntero siga sobre el overlay,
    // tampoco dejamos que un movimiento o una pulsación vuelva a revelarla.
    if (isChatInteraction) {
      clearHideTimer();
      if (isMobileTouchDevice()) {
        dom.playerFrame.classList.remove("player-overlay-suppressed");
        setOverlayVisible(true);
        scheduleHide();
        return;
      }
      dom.playerFrame.classList.add("player-overlay-suppressed");
      setOverlayVisible(false);
      scheduleHide();
      return;
    }

    dom.playerFrame.classList.remove("player-overlay-suppressed");
    setOverlayVisible(true);
    scheduleHide();
  };

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
    // Darle un margen al cursor para volver al reproductor. Si vuelve antes
    // de este plazo, revealOverlay cancela este ocultamiento y reinicia el
    // contador normal de la barra.
    scheduleHide(PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS);
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

    const fullscreenTarget = dom.sessionView?.closest(".app-shell")
      || dom.sessionView
      || document.documentElement;
    if (USE_NATIVE_FULLSCREEN && document.fullscreenEnabled && typeof fullscreenTarget?.requestFullscreen === "function") {
      captureFullscreenScroll(true);
      // La app completa conserva la cabecera de la sala dentro del fullscreen,
      // pero el contenedor se ajusta por inset en lugar de heredar el alto
      // previo del <html> durante la transicion de Chrome.
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
  restoreFullscreenScroll(isFullscreen);
  syncInsideChatPanelOffset();
  logEvent("ui", isFullscreen ? "Pantalla completa de pagina activada." : "Pantalla completa desactivada.");
}

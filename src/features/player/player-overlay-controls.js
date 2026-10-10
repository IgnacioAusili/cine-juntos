import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { wireMobileVideoOverlayGestures } from "./player-overlay-touch-gestures.js?v=20261010-file-size-refactor-02";
import { wirePlayerOverlayVolumeEvents } from "./player-overlay-volume-events.js?v=20261010-file-size-refactor-02";

const PLAYER_OVERLAY_IDLE_MS = 3000;
const PLAYER_OVERLAY_LEAVE_HIDE_DELAY_MS = 800;
const MOBILE_OVERLAY_TOGGLE_LOCK_MS = 320;
const MOBILE_PLAYER_MEDIA_QUERY = "(max-width: 980px) and (hover: none) and (pointer: coarse)";
let hideTimer = null;
const volumeState = { active: false };
const overlayState = { suppressChatToggleUntil: 0 };

export function wirePlayerOverlayControls({ togglePlayback } = {}) {
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
    // Sin contenido, la barra es parte del estado vacío del reproductor y no
    // debe desaparecer por inactividad ni por una interacción con el video.
    if (dom.playerFrame.classList.contains("player-no-content")) return;
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
      if (
        dom.playerVolumeGroup?.classList.contains("is-dragging")
        || volumeState.active
        || dom.playerVolumeInput?.matches(":active")
      ) {
        scheduleHide(safeDelay);
        return;
      }
      hideTooltip(true);
      if (document.activeElement === dom.playerRateSelect) {
        dom.playerRateSelect.blur();
      }
      setOverlayVisible(false);
      dom.playerFrame.classList.add("player-cursor-hidden");
    }, safeDelay);
  };

  let controlDragActive = false;
  let suppressFocusoutHideUntil = 0;
  const resetOverlayHideAfterControlDrag = () => {
    controlDragActive = false;
    suppressFocusoutHideUntil = Date.now() + 600;
    if (isInlinePlayerDialogVisible()) return;
    dom.playerFrame.classList.remove("player-cursor-hidden");
    setOverlayVisible(true);
    scheduleHide();
  };

  const startControlDrag = () => {
    controlDragActive = true;
    suppressFocusoutHideUntil = 0;
    clearHideTimer();
  };
  window.addEventListener("player-seek-drag-start", startControlDrag);
  window.addEventListener("player-volume-drag-start", startControlDrag);
  window.addEventListener("player-seek-drag-end", resetOverlayHideAfterControlDrag);
  window.addEventListener("player-volume-drag-end", resetOverlayHideAfterControlDrag);

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

  const touchState = { mobileTouchInteractionActive: false, suppressMobileVideoRevealUntil: 0, videoClickTimer: null };
  wireMobileVideoOverlayGestures({ touchState, isMobileTouchDevice, clearHideTimer, isInlinePlayerDialogVisible, setOverlayVisible, scheduleHide });

  dom.videoPlayer.addEventListener("click", (event) => {
    if (event.target !== dom.videoPlayer) return;
    if (isMobileTouchDevice()) {
      // En táctil el overlay se alterna en pointerup/touchend. El click
      // sintético posterior solo debe consumirse para no procesar el toque
      // dos veces y volver a mostrar la barra después de ocultarla.
      event.preventDefault();
      return;
    }

    if (typeof togglePlayback !== "function") return;
    if (touchState.videoClickTimer) window.clearTimeout(touchState.videoClickTimer);
    touchState.videoClickTimer = window.setTimeout(() => {
      touchState.videoClickTimer = null;
      togglePlayback();
    }, 220);
  });
  dom.videoPlayer.addEventListener("dblclick", () => {
    if (!touchState.videoClickTimer) return;
    window.clearTimeout(touchState.videoClickTimer);
    touchState.videoClickTimer = null;
  });

  const revealOverlay = (event) => {
    if (isInlinePlayerDialogVisible()) return;

    if (event?.type === "focusin" && dom.playerFrame.dataset.suppressOverlayFocus === "1") {
      delete dom.playerFrame.dataset.suppressOverlayFocus;
      return;
    }

    const target = event?.target instanceof Element ? event.target : null;
    if (
      isMobileTouchDevice()
      && target === dom.videoPlayer
      && (touchState.mobileTouchInteractionActive || Date.now() < touchState.suppressMobileVideoRevealUntil)
    ) return;
    const isChatToggle = target?.closest("#playerChatToggleButton");
    // El botón del chat es una acción independiente del reproductor: no debe
    // cambiar la visibilidad de la barra ni provocar el estado suprimido.
    if (isChatToggle || Date.now() < overlayState.suppressChatToggleUntil) return;
    if (
      isMobileTouchDevice()
      && Date.now() < touchState.suppressMobileVideoRevealUntil
      && !target?.closest(".player-chat")
    ) return;
    if (
      isMobileTouchDevice()
      && target === dom.videoPlayer
      && (event?.type === "mousedown" || event?.type === "mouseenter")
    ) return;
    dom.playerFrame.classList.remove("player-cursor-hidden");
    if (dom.playerFrame.classList.contains("player-no-content")) {
      clearHideTimer();
      dom.playerFrame.classList.remove("player-overlay-suppressed");
      setOverlayVisible(true);
      return;
    }
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

  // La flecha puede quedar fuera del player-frame cuando el chat está
  // contraído. En ese caso el mouseleave del video inicia el margen corto de
  // salida y la flecha no alcanzaba a reiniciar el contador normal de la barra.
  // Tratarla como una interacción del video mantiene ambos recorridos en 3 s.
  wirePlayerOverlayVolumeEvents({ volumeState, overlayState, clearHideTimer, setOverlayVisible, scheduleHide, revealOverlay });

  const revealOverlayFromCollapseHandle = (event) => {
    if (event?.pointerType && event.pointerType !== "mouse") return;
    if (isInlinePlayerDialogVisible()) return;
    clearHideTimer();
    dom.playerFrame.classList.remove("player-cursor-hidden", "player-overlay-suppressed");
    setOverlayVisible(true);
    scheduleHide();
  };

  [dom.collapseChatButton, dom.expandChatButton]
    .filter(Boolean)
    .map((button) => button.closest(".chat-collapse-hover-zone"))
    .filter(Boolean)
    .forEach((collapseHandleZone) => {
      collapseHandleZone.addEventListener("mouseenter", revealOverlayFromCollapseHandle);
      collapseHandleZone.addEventListener("mousemove", revealOverlayFromCollapseHandle);
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
    if (controlDragActive || Date.now() < suppressFocusoutHideUntil) return;
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

import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { hideSeekTooltip, showSeekTooltip } from "./player-seek-tooltip-view.js?v=20261010-file-size-refactor-02";
import { seekTooltipState } from "./player-seek-tooltip-state.js?v=20261010-file-size-refactor-02";

const SEEK_THUMB_WIDTH = 14;

function getFiniteDuration() {
  return Number.isFinite(dom.videoPlayer.duration) ? Math.max(0, dom.videoPlayer.duration) : 0;
}
function hasLoadedMediaSource() {
  return Boolean(dom.videoPlayer.getAttribute("src"));
}

export function wireSeekTooltipEvents() {
  if (!dom.playerSeekInput || !dom.tooltipLayer) return;

  const setSeekDragActive = (active) => {
    state.ui.seekDragActive = active;
    dom.playerFrame?.classList.toggle("player-seek-control-dragging", active);
  };

  const handlePointerMove = (event) => {
    if (seekTooltipState.pointerId !== null && event.pointerId !== seekTooltipState.pointerId) return;
    if (dom.playerSeekInput.disabled) {
      setSeekDragActive(false);
      seekTooltipState.pointerId = null;
      hideSeekTooltip();
      return;
    }
    queueSeekTooltipFromPointer(event);
  };

  const handlePointerDown = (event) => {
    if (dom.playerSeekInput.disabled) {
      setSeekDragActive(false);
      hideSeekTooltip();
      return;
    }
    if (seekTooltipState.pointerId !== null && seekTooltipState.pointerId !== event.pointerId) return;

    const isSeekTooltipAlreadyVisible = Boolean(seekTooltipState.point && !dom.tooltipLayer.hidden);
    if (!isSeekTooltipAlreadyVisible) hideTooltip(true);
    setSeekDragActive(true);
    window.dispatchEvent(new Event("player-seek-drag-start"));
    seekTooltipState.pointerId = event.pointerId;
    try {
      dom.playerSeekInput.setPointerCapture?.(event.pointerId);
    } catch {
      // Algunos eventos sintéticos o punteros que ya perdieron captura no
      // permiten reclamarla; el listener de window mantiene el arrastre.
    }
    handlePointerMove(event);
  };

  const stopPointerTracking = (event) => {
    if (seekTooltipState.pointerId === null || event.pointerId !== seekTooltipState.pointerId) return;
    setSeekDragActive(false);
    seekTooltipState.pointerId = null;
    const rect = dom.playerSeekInput.getBoundingClientRect();
    const pointerRemainsOverSeekInput = event.pointerType === "mouse"
      && event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
    if (pointerRemainsOverSeekInput) {
      queueSeekTooltipFromPointer(event);
    } else {
      hideSeekTooltip();
    }
    window.dispatchEvent(new Event("player-seek-drag-end"));
  };

  const handlePointerLeave = () => {
    if (seekTooltipState.pointerId === null) hideSeekTooltip();
  };

  const handleWindowPointerMove = (event) => {
    if (seekTooltipState.pointerId !== null) handlePointerMove(event);
  };

  dom.playerSeekInput.addEventListener("pointerenter", handlePointerMove);
  dom.playerSeekInput.addEventListener("pointermove", handlePointerMove);
  dom.playerSeekInput.addEventListener("pointerdown", handlePointerDown);
  dom.playerSeekInput.addEventListener("pointerleave", handlePointerLeave);
  // Perder la captura no siempre significa que terminó el gesto: algunos
  // navegadores móviles la liberan al sacar el dedo del track. Los listeners
  // globales de pointerup/pointercancel siguen el arrastre hasta su final real.
  dom.playerSeekInput.addEventListener("blur", () => {
    if (seekTooltipState.pointerId === null) hideSeekTooltip();
  });
  window.addEventListener("pointermove", handleWindowPointerMove);
  window.addEventListener("pointerup", stopPointerTracking);
  window.addEventListener("pointercancel", stopPointerTracking);
}

function updateSeekTooltipFromPointer(event) {
  if (isPointerOverRateMenu(event)) {
    hideSeekTooltip();
    return;
  }
  const duration = getFiniteDuration();
  if (!dom.playerSeekInput || !dom.tooltipLayer || !hasLoadedMediaSource() || duration <= 0) {
    hideSeekTooltip();
    return;
  }

  const rect = dom.playerSeekInput.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    hideSeekTooltip();
    return;
  }

  const clientX = Number.isFinite(event?.clientX)
    ? event.clientX
    : rect.left + rect.width / 2;
  // El centro del thumb no recorre todo el ancho del input: queda insetado
  // medio thumb en cada extremo. Usar ese recorrido evita que el tooltip se
  // despegue del thumb cuando el valor está en 0 o en la duración máxima.
  const thumbInset = Math.min(rect.width / 2, SEEK_THUMB_WIDTH / 2);
  const minThumbX = rect.left + thumbInset;
  const maxThumbX = rect.right - thumbInset;
  const clampedClientX = Math.min(maxThumbX, Math.max(minThumbX, clientX));
  const ratio = (clampedClientX - minThumbX) / (maxThumbX - minThumbX);
  const nextTime = duration * ratio;

  showSeekTooltip(nextTime, clampedClientX, rect);
}

function isPointerOverRateMenu(event) {
  const clientX = Number(event?.clientX);
  const clientY = Number(event?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

  const openMenu = dom.playerRateSelect
    ?.closest(".player-rate-select")
    ?.querySelector(".player-rate-menu:not([hidden])");
  if (!openMenu) return false;

  const menuRect = openMenu.getBoundingClientRect();
  if (
    menuRect
    && clientX >= menuRect.left
    && clientX <= menuRect.right
    && clientY >= menuRect.top
    && clientY <= menuRect.bottom
  ) {
    return true;
  }

  const elementUnderPointer = document.elementFromPoint(clientX, clientY);
  return Boolean(elementUnderPointer?.closest?.(".player-rate-menu"));
}

function queueSeekTooltipFromPointer(event) {
  seekTooltipState.pendingPointer = {
    clientX: event?.clientX,
    clientY: event?.clientY,
  };
  if (seekTooltipState.pointerFrame) return;

  seekTooltipState.pointerFrame = window.requestAnimationFrame(() => {
    seekTooltipState.pointerFrame = 0;
    const pointer = seekTooltipState.pendingPointer;
    seekTooltipState.pendingPointer = null;
    if (pointer) updateSeekTooltipFromPointer(pointer);
  });
}

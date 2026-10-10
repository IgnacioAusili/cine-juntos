import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../core/state.js?v=20261010-file-size-refactor-02";
import { tooltipState } from "./tooltip-state.js?v=20261010-file-size-refactor-02";
import { isTouchPointer, TOUCH_LONG_PRESS_DELAY_MS } from "../core/touch-interactions.js?v=20261010-file-size-refactor-02";
import { TOOLTIP_SHOW_DELAY_MS, TOUCH_FOCUS_SUPPRESSION_MS, TOUCH_TOOLTIP_MOVE_TOLERANCE_PX, TOUCH_HELP_TOOLTIP_MAX_VISIBLE_MS } from "./tooltip-constants.js?v=20261010-file-size-refactor-02";
import { hideTooltip, showTooltip, refreshTooltipForTarget, getTooltipContext, isPointInsideElement, isButtonTooltipContext, isSelectTooltipContext, isPresenceTooltipContext, isStatusTooltipContext, scheduleTooltip, cancelScheduledTooltip, clearTouchTooltipPress, setTooltipTouchHover, suppressTouchTooltipClick } from "./tooltip-behavior.js?v=20261010-file-size-refactor-02";

export function wireTooltipEvents() {
  if (!dom.tooltipLayer) return;

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    if (event.target.closest?.(".player-rate-menu")) {
      cancelScheduledTooltip();
      hideTooltip();
      return;
    }
    const context = getTooltipContext(event.target);
    if (context) scheduleTooltip(context);
  });

  document.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse") return;
    const context = getTooltipContext(event.target);
    if (!context) return;
    if (event.relatedTarget instanceof Node && context.anchor.contains(event.relatedTarget)) return;
    if (context.anchor === tooltipState.tooltipShowContext?.anchor) cancelScheduledTooltip();
    if (context.anchor === state.ui.tooltipTarget) hideTooltip();
  });

  document.addEventListener("pointermove", (event) => {
    if (isTouchPointer(event) && tooltipState.touchTooltipPress?.pointerId === event.pointerId) {
      const movedX = event.clientX - tooltipState.touchTooltipPress.x;
      const movedY = event.clientY - tooltipState.touchTooltipPress.y;
      if (Math.hypot(movedX, movedY) > TOUCH_TOOLTIP_MOVE_TOLERANCE_PX) {
        clearTouchTooltipPress();
        hideTooltip();
        return;
      }
    }

    if (!state.ui.tooltipTarget) return;
    if (!isPointInsideElement(state.ui.tooltipTarget, event.clientX, event.clientY)) hideTooltip();
  });

  document.addEventListener("pointerdown", (event) => {
    const context = getTooltipContext(event.target);
    if (!context) return;
    const isHelpButton = context.anchor.classList?.contains("help-button");
    const isPresenceButton = isPresenceTooltipContext(context);
    const isStatusButton = isStatusTooltipContext(context);
    if (event.pointerType === "mouse" && isSelectTooltipContext(context)) {
      tooltipState.suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceButton || isStatusButton) return;
      tooltipState.suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;

    tooltipState.suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    window.clearTimeout(state.ui.tooltipPressTimer);
    state.ui.tooltipPressTimer = null;
    clearTouchTooltipPress();

    // Un tooltip anterior de otra ancla no debe bloquear el nuevo toque.
    if (state.ui.tooltipTarget && state.ui.tooltipTarget !== context.anchor) {
      setTooltipTouchHover(state.ui.tooltipTarget, false);
      cancelScheduledTooltip();
    } else if (state.ui.tooltipTarget !== context.anchor || dom.tooltipLayer.hidden) {
      // Si el mismo tooltip ya está visible, mantenerlo durante la pulsación.
      // El click que llega al soltar es el que lo alterna a oculto.
      hideTooltip();
    }
    tooltipState.touchTooltipPress = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      context,
      isHelpButton,
      isPresenceButton,
      isStatusButton,
      longPress: false,
    };
    setTooltipTouchHover(context.anchor, true);
    tooltipState.touchTooltipTimer = window.setTimeout(() => {
      if (
        !tooltipState.touchTooltipPress
        || tooltipState.touchTooltipPress.pointerId !== event.pointerId
        || !tooltipState.touchTooltipPress.context.anchor.isConnected
      ) return;

      tooltipState.touchTooltipPress.longPress = true;
      showTooltip(tooltipState.touchTooltipPress.context);
    }, TOUCH_LONG_PRESS_DELAY_MS);
  });

  document.addEventListener("pointerup", (event) => {
    const context = getTooltipContext(event.target);
    const isHelpButton = context?.anchor.classList?.contains("help-button");
    const isStatusButton = isStatusTooltipContext(context);
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceTooltipContext(context) || isStatusButton) return;
      tooltipState.suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;
    tooltipState.suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    const press = tooltipState.touchTooltipPress;
    if (
      press?.pointerId === event.pointerId
      && (press.isHelpButton || press.isPresenceButton || press.isStatusButton)
      && press.context.anchor.isConnected
    ) {
      if (press.longPress) {
        suppressTouchTooltipClick(press.context.anchor);
        clearTouchTooltipPress();
        hideTooltip();
        return;
      }
      const shortTapAnchor = press.context.anchor;
      clearTouchTooltipPress();
      // En un toque corto el click nativo del botón es el que alterna el
      // tooltip. Evitamos mostrarlo aquí y volver a procesar el mismo gesto.
      // Conservamos el brillo durante el puente pointerup -> click para que
      // no haya un parpadeo visible.
      setTooltipTouchHover(shortTapAnchor, true);
      return;
    }

    clearTouchTooltipPress();
    hideTooltip();
  });

  document.addEventListener("click", (event) => {
    const context = getTooltipContext(event.target);
    if (
      !isPresenceTooltipContext(context)
      && !context?.anchor?.classList?.contains("help-button")
      && !isStatusTooltipContext(context)
    ) return;
    if (tooltipState.suppressedTouchTooltipClickTargets.delete(context.anchor)) {
      return;
    }
    const isMobileTooltipButton = context.anchor.classList?.contains("help-button")
      || isPresenceTooltipContext(context)
      || isStatusTooltipContext(context);
    if (window.matchMedia("(max-width: 680px)").matches && isMobileTooltipButton) {
      if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) {
        if (dom.tooltipLayer.style.visibility === "hidden") {
          // Los toques durante la entrada no deben cerrar el tooltip antes de verlo.
          window.clearTimeout(state.ui.tooltipPressTimer);
          state.ui.tooltipPressTimer = window.setTimeout(
            hideTooltip,
            TOUCH_HELP_TOOLTIP_MAX_VISIBLE_MS,
          );
          return;
        }
        hideTooltip();
      } else {
        showTooltip(context);
        state.ui.tooltipPressTimer = window.setTimeout(
          hideTooltip,
          TOUCH_HELP_TOOLTIP_MAX_VISIBLE_MS,
        );
      }
      return;
    }
    if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) return;
    showTooltip(context);
  });

  document.addEventListener("pointercancel", (event) => {
    if (!isTouchPointer(event)) return;
    tooltipState.suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    clearTouchTooltipPress();
    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    if (event.__skipTooltipForRestoredFocus) return;
    if (performance.now() < tooltipState.suppressFocusTooltipUntil) return;
    const context = getTooltipContext(event.target);
    if (context) showTooltip(context);
  });

  document.addEventListener("keydown", (event) => {
    const select = event.target.closest?.("select");
    if (!select) return;
    const opensMenu = event.key === "Enter"
      || event.key === " "
      || event.key === "ArrowDown"
      || event.key === "ArrowUp"
      || (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp"));
    if (!opensMenu) return;
    tooltipState.suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
    hideTooltip();
  });

  document.addEventListener("focusout", (event) => {
    if (getTooltipContext(event.target)) hideTooltip();
  });

  document.addEventListener("input", (event) => {
    if (event.target === dom.playerSeekInput && state.ui.seekDragActive) return;
    if (event.target.matches?.("input, textarea, [contenteditable='true']")) hideTooltip();
  });

  window.addEventListener("resize", hideTooltip);
  window.addEventListener("scroll", hideTooltip, true);
}

import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { tooltipState } from "./tooltip-state.js?v=20261010-file-size-refactor-02";
import { state } from "../core/state.js?v=20261010-file-size-refactor-02";
import { setConnection } from "./session-ui.js?v=20261010-file-size-refactor-02";
import { isTouchPointer, TOUCH_LONG_PRESS_DELAY_MS } from "../core/touch-interactions.js?v=20261010-file-size-refactor-02";
import { syncTooltipChrome } from "./tooltip-bubble-chrome.js?v=20261010-file-size-refactor-02";
import { TOOLTIP_ANCHOR_SELECTOR, TOOLTIP_VIEWPORT_PADDING, TOOLTIP_GAP, TOOLTIP_SHOW_DELAY_MS, HELP_TOOLTIP_SHOW_DELAY_MS, PRESENCE_TOOLTIP_SHOW_DELAY_MS, TOOLTIP_HIDE_ANIMATION_MS, TOUCH_FOCUS_SUPPRESSION_MS, TOUCH_TOOLTIP_MOVE_TOLERANCE_PX, TOUCH_HELP_TOOLTIP_MAX_VISIBLE_MS } from "./tooltip-constants.js?v=20261010-file-size-refactor-02";


export function suppressTouchTooltipClick(anchor) {
  if (anchor) tooltipState.suppressedTouchTooltipClickTargets.add(anchor);
}

export function setTooltipTouchHover(anchor, active) {
  if (!anchor?.classList?.contains("help-button")) return;
  anchor.classList.toggle("is-touch-hover", active);
}

export function refreshTooltipForTarget(target) {
  if (!dom.tooltipLayer || dom.tooltipLayer.hidden) return;
  const context = getTooltipContext(target);
  if (!context || state.ui.tooltipTarget !== context.anchor) return;
  dom.tooltipLayer.textContent = context.source.dataset.tooltip || "";
  if (!dom.tooltipLayer.textContent) return;
  positionTooltip(context.anchor);
}

export function isPointInsideElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function getTooltipContext(target) {
  if (!(target instanceof Element)) return null;

  const source = target.closest?.("[data-tooltip]");
  if (source) {
    return {
      source,
      anchor: getTooltipAnchor(source),
    };
  }

  const interactive = target.closest?.(TOOLTIP_ANCHOR_SELECTOR);
  if (!interactive) return null;

  const nestedSource = interactive.querySelector?.("[data-tooltip]");
  if (!nestedSource) return null;

  // Un label puede contener un help-button. No heredar su tooltip cuando el
  // cursor está sobre el resto del label: la zona activa debe ser el botón.
  const nestedHelpButton = nestedSource.closest?.(".help-button");
  if (nestedHelpButton && !target.closest?.(".help-button")) return null;

  return {
    source: nestedSource,
    anchor: getTooltipAnchor(nestedSource),
  };
}

export function getTooltipAnchor(source) {
  if (source.classList?.contains("chat-collapse-icon-anchor")) return source;
  return source.closest?.(TOOLTIP_ANCHOR_SELECTOR) || source;
}

function getTooltipAnchorRect(anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  if (!anchor.classList?.contains("presence-pill")) return anchorRect;

  const visibleParts = [...anchor.querySelectorAll(".presence-dot, .presence-self-label, #participantCount, #overlayParticipantCount")]
    .map((part) => part.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!visibleParts.length) return anchorRect;

  const top = Math.min(...visibleParts.map((rect) => rect.top));
  const right = Math.max(...visibleParts.map((rect) => rect.right));
  const bottom = Math.max(...visibleParts.map((rect) => rect.bottom));
  const left = Math.min(...visibleParts.map((rect) => rect.left));
  return {
    top,
    right,
    bottom,
    left,
    width: right - left,
    height: bottom - top,
  };
}

export function isButtonTooltipContext(context) {
  return Boolean(context?.anchor?.matches?.("button, [role='button']"));
}

export function isSelectTooltipContext(context) {
  return Boolean(context?.anchor?.querySelector?.("select"));
}

export function isPresenceTooltipContext(context) {
  return Boolean(context?.anchor?.classList?.contains("presence-pill"));
}

export function isStatusTooltipContext(context) {
  return Boolean(context?.anchor?.matches?.(".app-status, .player-status-badge"));
}

export function scheduleTooltip(context) {
  if (state.ui.seekDragActive) return;
  if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) return;
  if (tooltipState.tooltipShowContext?.anchor === context.anchor) return;

  cancelScheduledTooltip();
  tooltipState.tooltipShowContext = context;
  const showDelay = isPresenceTooltipContext(context)
    ? PRESENCE_TOOLTIP_SHOW_DELAY_MS
    : context.anchor.classList?.contains("help-button")
      ? HELP_TOOLTIP_SHOW_DELAY_MS
      : TOOLTIP_SHOW_DELAY_MS;
  tooltipState.tooltipShowTimer = window.setTimeout(() => {
    const pendingContext = tooltipState.tooltipShowContext;
    tooltipState.tooltipShowTimer = null;
    tooltipState.tooltipShowContext = null;
    if (!pendingContext?.anchor?.isConnected) return;
    if (state.ui.seekDragActive) return;
    showTooltip(pendingContext);
  }, showDelay);
}

export function cancelScheduledTooltip() {
  if (tooltipState.tooltipShowTimer !== null) window.clearTimeout(tooltipState.tooltipShowTimer);
  tooltipState.tooltipShowTimer = null;
  tooltipState.tooltipShowContext = null;
}

export function showTooltip(context) {
  if (state.ui.seekDragActive) return;
  const text = context?.source?.dataset?.tooltip;
  if (!text) return;
  cancelScheduledTooltip();
  window.clearTimeout(tooltipState.tooltipHideTimer);
  tooltipState.tooltipHideTimer = null;
  window.clearTimeout(state.ui.tooltipPressTimer);
  state.ui.tooltipPressTimer = null;
  setTooltipTouchHover(state.ui.tooltipTarget, false);
  state.ui.tooltipTarget = context.anchor;
  setTooltipTouchHover(context.anchor, true);
  dom.tooltipLayer.textContent = text;
  dom.tooltipLayer.style.setProperty("transition", "none");
  tooltipChrome?.style.setProperty("transition", "none");
  dom.tooltipLayer.hidden = false;
  dom.tooltipLayer.style.visibility = "hidden";
  dom.tooltipLayer.style.left = "0px";
  dom.tooltipLayer.style.top = "0px";
  dom.tooltipLayer.dataset.animationState = "entering";
  dom.tooltipLayer.removeAttribute("data-placement");

  window.cancelAnimationFrame(tooltipState.tooltipFrame);
  tooltipState.tooltipFrame = window.requestAnimationFrame(() => {
    if (state.ui.tooltipTarget !== context.anchor || dom.tooltipLayer.hidden) return;
    positionTooltip(context.anchor);
    dom.tooltipLayer.style.visibility = "";
    void dom.tooltipLayer.offsetWidth;
    window.requestAnimationFrame(() => {
      if (state.ui.tooltipTarget !== context.anchor || dom.tooltipLayer.hidden) return;
      dom.tooltipLayer.style.removeProperty("transition");
      tooltipChrome?.style.removeProperty("transition");
      dom.tooltipLayer.dataset.animationState = "visible";
    });
  });
}

export function positionTooltip(anchor) {
  const rect = getTooltipAnchorRect(anchor);
  const tooltipRect = dom.tooltipLayer.getBoundingClientRect();
  const tooltipVisualHeight = tooltipRect.height + TOOLTIP_TAIL_HEIGHT_PX;
  const maxLeft = Math.max(TOOLTIP_VIEWPORT_PADDING, window.innerWidth - tooltipRect.width - TOOLTIP_VIEWPORT_PADDING);
  const maxTop = Math.max(TOOLTIP_VIEWPORT_PADDING, window.innerHeight - tooltipRect.height - TOOLTIP_VIEWPORT_PADDING);
  const rawLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(Math.max(rawLeft, TOOLTIP_VIEWPORT_PADDING), maxLeft);
  const candidateBelow = rect.bottom + TOOLTIP_GAP + TOOLTIP_TAIL_HEIGHT_PX;
  const candidateAbove = rect.top - tooltipVisualHeight - TOOLTIP_GAP;
  const fitsBelow = candidateBelow + tooltipRect.height <= window.innerHeight - TOOLTIP_VIEWPORT_PADDING;
  const fitsAbove = candidateAbove >= TOOLTIP_VIEWPORT_PADDING;
  const showBelow = fitsBelow || (!fitsAbove && window.innerHeight - rect.bottom >= rect.top);
  const desiredTop = showBelow ? candidateBelow : candidateAbove;
  const top = Math.min(Math.max(desiredTop, TOOLTIP_VIEWPORT_PADDING), maxTop);
  const pathWidth = Math.max(0, tooltipRect.width - TOOLTIP_BORDER_WIDTH_PX);
  const arrowPadding = TOOLTIP_RADIUS_PX + TOOLTIP_TAIL_WIDTH_PX / 2;
  const arrowOffset = Math.min(
    Math.max(rect.left + rect.width / 2 - left - TOOLTIP_BORDER_WIDTH_PX / 2, arrowPadding),
    Math.max(arrowPadding, pathWidth - arrowPadding),
  );

  dom.tooltipLayer.style.top = `${top}px`;
  dom.tooltipLayer.style.left = `${left}px`;
  dom.tooltipLayer.style.setProperty("--tooltip-arrow-offset", `${Math.round(arrowOffset)}px`);
  dom.tooltipLayer.dataset.placement = showBelow ? "bottom" : "top";
}

export function hideTooltip(force = false) {
  if (state.ui.seekDragActive && !force) return;
  cancelScheduledTooltip();
  clearTouchTooltipPress();
  setTooltipTouchHover(state.ui.tooltipTarget, false);
  state.ui.tooltipTarget = null;
  window.clearTimeout(state.ui.tooltipPressTimer);
  state.ui.tooltipPressTimer = null;
  window.cancelAnimationFrame(tooltipState.tooltipFrame);
  tooltipState.tooltipFrame = 0;
  if (!dom.tooltipLayer || dom.tooltipLayer.hidden) return;

  const finishHide = () => {
    tooltipState.tooltipHideTimer = null;
    dom.tooltipLayer.hidden = true;
    dom.tooltipLayer.textContent = "";
    dom.tooltipLayer.style.visibility = "";
    dom.tooltipLayer.style.removeProperty("--tooltip-arrow-offset");
    dom.tooltipLayer.style.removeProperty("transition");
    tooltipChrome?.style.removeProperty("transition");
    dom.tooltipLayer.removeAttribute("data-animation-state");
    dom.tooltipLayer.removeAttribute("data-placement");
  };

  window.clearTimeout(tooltipState.tooltipHideTimer);
  if (force || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    finishHide();
    return;
  }

  dom.tooltipLayer.style.removeProperty("transition");
  tooltipChrome?.style.removeProperty("transition");
  dom.tooltipLayer.dataset.animationState = "leaving";
  tooltipState.tooltipHideTimer = window.setTimeout(finishHide, TOOLTIP_HIDE_ANIMATION_MS);
}

export function clearTouchTooltipPress() {
  setTooltipTouchHover(tooltipState.touchTooltipPress?.context?.anchor, false);
  if (tooltipState.touchTooltipTimer !== null) window.clearTimeout(tooltipState.touchTooltipTimer);
  tooltipState.touchTooltipTimer = null;
  tooltipState.touchTooltipPress = null;
}

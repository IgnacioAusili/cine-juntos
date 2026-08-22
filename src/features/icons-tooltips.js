import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { setConnection } from "./session-ui.js";
import { createForeignDocumentIcon } from "./foreign-lucide-icon.js";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js";

const TOOLTIP_ANCHOR_SELECTOR = "button, [role='button'], a, label, summary, input, select, textarea";
const TOOLTIP_VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 4;
const TOOLTIP_SHOW_DELAY_MS = 800;
const HELP_TOOLTIP_SHOW_DELAY_MS = 500;
const PRESENCE_TOOLTIP_SHOW_DELAY_MS = 300;
const TOUCH_FOCUS_SUPPRESSION_MS = 500;
const TOUCH_TOOLTIP_MOVE_TOLERANCE_PX = 10;
const TOUCH_TOOLTIP_MAX_VISIBLE_MS = 2200;

let tooltipFrame = 0;
let tooltipShowTimer = null;
let tooltipShowContext = null;
let suppressFocusTooltipUntil = 0;
let touchTooltipPress = null;
let touchTooltipTimer = null;

export function initializeUi() {
  hydrateIcons();
  normalizeTooltips();
  wireTooltipEvents();
}

export function hydrateIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export function setControlIcon(control, iconName) {
  const currentIcon = control?.querySelector("[data-lucide], svg.lucide");
  if (!currentIcon) return;

  if (currentIcon.ownerDocument === document) {
    if (currentIcon.getAttribute("data-lucide") === iconName && currentIcon.childElementCount) return;
    currentIcon.setAttribute("data-lucide", iconName);
    currentIcon.innerHTML = "";
    hydrateIcons();
    return;
  }

  currentIcon.replaceWith(createForeignDocumentIcon(currentIcon.ownerDocument, iconName));
}

export function normalizeTooltips() {
  document.querySelectorAll("[title]").forEach((element) => {
    if (!element.dataset.tooltip) element.dataset.tooltip = element.getAttribute("title") || "";
    element.removeAttribute("title");
  });
}

export { setConnection };

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
    if (context.anchor === tooltipShowContext?.anchor) cancelScheduledTooltip();
    if (context.anchor === state.ui.tooltipTarget) hideTooltip();
  });

  document.addEventListener("pointermove", (event) => {
    if (isTouchPointer(event) && touchTooltipPress?.pointerId === event.pointerId) {
      const movedX = event.clientX - touchTooltipPress.x;
      const movedY = event.clientY - touchTooltipPress.y;
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
    if (event.pointerType === "mouse" && isSelectTooltipContext(context)) {
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceTooltipContext(context)) return;
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;

    suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    const shouldToggleOff = isHelpButton
      && state.ui.tooltipTarget === context.anchor
      && !dom.tooltipLayer.hidden;
    clearTouchTooltipPress();
    if (shouldToggleOff) {
      hideTooltip();
      return;
    }

    hideTooltip();
    touchTooltipPress = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      context,
      isHelpButton,
    };
    touchTooltipTimer = window.setTimeout(() => {
      if (
        !touchTooltipPress
        || touchTooltipPress.pointerId !== event.pointerId
        || !touchTooltipPress.context.anchor.isConnected
      ) return;

      showTooltip(touchTooltipPress.context);
      state.ui.tooltipPressTimer = window.setTimeout(hideTooltip, TOUCH_TOOLTIP_MAX_VISIBLE_MS);
    }, TOUCH_LONG_PRESS_DELAY_MS);
  });

  document.addEventListener("pointerup", (event) => {
    const context = getTooltipContext(event.target);
    const isHelpButton = context?.anchor.classList?.contains("help-button");
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceTooltipContext(context)) return;
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;
    suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    const press = touchTooltipPress;
    if (
      press?.pointerId === event.pointerId
      && press.isHelpButton
      && press.context.anchor.isConnected
    ) {
      clearTouchTooltipPress();
      showTooltip(press.context);
      state.ui.tooltipPressTimer = window.setTimeout(hideTooltip, TOUCH_TOOLTIP_MAX_VISIBLE_MS);
      return;
    }

    clearTouchTooltipPress();
    hideTooltip();
  });

  document.addEventListener("click", (event) => {
    const context = getTooltipContext(event.target);
    if (!isPresenceTooltipContext(context) && !context?.anchor?.classList?.contains("help-button")) return;
    if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) return;
    showTooltip(context);
  });

  document.addEventListener("pointercancel", (event) => {
    if (!isTouchPointer(event)) return;
    suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    clearTouchTooltipPress();
    hideTooltip();
  });

  document.addEventListener("focusin", (event) => {
    if (performance.now() < suppressFocusTooltipUntil) return;
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
    suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
    hideTooltip();
  });

  document.addEventListener("focusout", (event) => {
    if (getTooltipContext(event.target)) hideTooltip();
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches?.("input, textarea, [contenteditable='true']")) hideTooltip();
  });

  window.addEventListener("resize", hideTooltip);
  window.addEventListener("scroll", hideTooltip, true);
}

export function refreshTooltipForTarget(target) {
  if (!dom.tooltipLayer || dom.tooltipLayer.hidden) return;
  const context = getTooltipContext(target);
  if (!context || state.ui.tooltipTarget !== context.anchor) return;
  dom.tooltipLayer.textContent = context.source.dataset.tooltip || "";
  if (!dom.tooltipLayer.textContent) return;
  positionTooltip(context.anchor);
}

function isPointInsideElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getTooltipContext(target) {
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

function getTooltipAnchor(source) {
  if (source.classList?.contains("chat-collapse-icon-anchor")) return source;
  return source.closest?.(TOOLTIP_ANCHOR_SELECTOR) || source;
}

function isButtonTooltipContext(context) {
  return Boolean(context?.anchor?.matches?.("button, [role='button']"));
}

function isSelectTooltipContext(context) {
  return Boolean(context?.anchor?.querySelector?.("select"));
}

function isPresenceTooltipContext(context) {
  return Boolean(context?.anchor?.classList?.contains("presence-pill"));
}

function scheduleTooltip(context) {
  if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) return;
  if (tooltipShowContext?.anchor === context.anchor) return;

  cancelScheduledTooltip();
  tooltipShowContext = context;
  const showDelay = isPresenceTooltipContext(context)
    ? PRESENCE_TOOLTIP_SHOW_DELAY_MS
    : context.anchor.classList?.contains("help-button")
      ? HELP_TOOLTIP_SHOW_DELAY_MS
      : TOOLTIP_SHOW_DELAY_MS;
  tooltipShowTimer = window.setTimeout(() => {
    const pendingContext = tooltipShowContext;
    tooltipShowTimer = null;
    tooltipShowContext = null;
    if (!pendingContext?.anchor?.isConnected) return;
    showTooltip(pendingContext);
  }, showDelay);
}

function cancelScheduledTooltip() {
  if (tooltipShowTimer !== null) window.clearTimeout(tooltipShowTimer);
  tooltipShowTimer = null;
  tooltipShowContext = null;
}

function showTooltip(context) {
  const text = context?.source?.dataset?.tooltip;
  if (!text) return;
  cancelScheduledTooltip();
  state.ui.tooltipTarget = context.anchor;
  dom.tooltipLayer.textContent = text;
  dom.tooltipLayer.hidden = false;
  dom.tooltipLayer.style.visibility = "hidden";
  dom.tooltipLayer.style.left = "0px";
  dom.tooltipLayer.style.top = "0px";
  dom.tooltipLayer.removeAttribute("data-placement");

  window.cancelAnimationFrame(tooltipFrame);
  tooltipFrame = window.requestAnimationFrame(() => {
    if (state.ui.tooltipTarget !== context.anchor || dom.tooltipLayer.hidden) return;
    positionTooltip(context.anchor);
    dom.tooltipLayer.style.visibility = "";
  });
}

function positionTooltip(anchor) {
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = dom.tooltipLayer.getBoundingClientRect();
  const maxLeft = Math.max(TOOLTIP_VIEWPORT_PADDING, window.innerWidth - tooltipRect.width - TOOLTIP_VIEWPORT_PADDING);
  const maxTop = Math.max(TOOLTIP_VIEWPORT_PADDING, window.innerHeight - tooltipRect.height - TOOLTIP_VIEWPORT_PADDING);
  const rawLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(Math.max(rawLeft, TOOLTIP_VIEWPORT_PADDING), maxLeft);
  const candidateBelow = rect.bottom + TOOLTIP_GAP;
  const candidateAbove = rect.top - tooltipRect.height - TOOLTIP_GAP;
  const fitsBelow = candidateBelow + tooltipRect.height <= window.innerHeight - TOOLTIP_VIEWPORT_PADDING;
  const fitsAbove = candidateAbove >= TOOLTIP_VIEWPORT_PADDING;
  const top = fitsBelow
    ? candidateBelow
    : fitsAbove
      ? candidateAbove
      : Math.min(Math.max(candidateBelow, TOOLTIP_VIEWPORT_PADDING), maxTop);
  const arrowPadding = 14;
  const arrowOffset = Math.min(
    Math.max(rect.left + rect.width / 2 - left, arrowPadding),
    Math.max(arrowPadding, tooltipRect.width - arrowPadding),
  );

  dom.tooltipLayer.style.top = `${top}px`;
  dom.tooltipLayer.style.left = `${left}px`;
  dom.tooltipLayer.style.setProperty("--tooltip-arrow-offset", `${Math.round(arrowOffset)}px`);
  dom.tooltipLayer.dataset.placement = top > rect.bottom ? "bottom" : "top";
}

export function hideTooltip() {
  cancelScheduledTooltip();
  clearTouchTooltipPress();
  state.ui.tooltipTarget = null;
  window.clearTimeout(state.ui.tooltipPressTimer);
  window.cancelAnimationFrame(tooltipFrame);
  tooltipFrame = 0;
  dom.tooltipLayer.hidden = true;
  dom.tooltipLayer.style.visibility = "";
  dom.tooltipLayer.style.removeProperty("--tooltip-arrow-offset");
  dom.tooltipLayer.removeAttribute("data-placement");
}

function clearTouchTooltipPress() {
  if (touchTooltipTimer !== null) window.clearTimeout(touchTooltipTimer);
  touchTooltipTimer = null;
  touchTooltipPress = null;
}

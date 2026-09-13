import { dom } from "../core/dom.js";
import { state } from "../core/state.js?v=20260912-name-session-01";
import {
  buildContinuousBubblePath,
  clampBubbleTailCenter,
} from "../core/continuous-bubble.js?v=20260912-continuous-bubble-01";
import { setConnection } from "./session-ui.js?v=20260911-orientation-scroll-anchor-01";
import { createForeignDocumentIcon } from "./foreign-lucide-icon.js";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js";

const TOOLTIP_ANCHOR_SELECTOR = "button, [role='button'], a, label, summary, input, select, textarea";
const TOOLTIP_VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 4;
const TOOLTIP_BORDER_WIDTH_PX = 1;
const TOOLTIP_RADIUS_PX = 12;
const TOOLTIP_TAIL_WIDTH_PX = 14;
const TOOLTIP_TAIL_HEIGHT_PX = 7;
const TOOLTIP_SHOW_DELAY_MS = 800;
const HELP_TOOLTIP_SHOW_DELAY_MS = 500;
const PRESENCE_TOOLTIP_SHOW_DELAY_MS = 300;
const TOUCH_FOCUS_SUPPRESSION_MS = 500;
const TOUCH_TOOLTIP_MOVE_TOLERANCE_PX = 10;
const TOUCH_HELP_TOOLTIP_MAX_VISIBLE_MS = 1800;

let tooltipFrame = 0;
let tooltipShowTimer = null;
let tooltipShowContext = null;
let suppressFocusTooltipUntil = 0;
let touchTooltipPress = null;
let touchTooltipTimer = null;
const suppressedTouchTooltipClickTargets = new Set();
let tooltipChrome = null;
let tooltipChromePath = null;
const emojiPopoverChromes = new Map();
let bubbleChromeObserversReady = false;

function createBubbleChrome(className, zIndex) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.classList.add(className);
  svg.append(path);
  svg.style.zIndex = String(zIndex);
  svg.setAttribute("aria-hidden", "true");
  document.body.append(svg);
  return { svg, path };
}

function parseCssPixel(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCssOffset(value, width, fallback) {
  const normalized = String(value || "").trim();
  if (normalized.endsWith("%")) {
    const percentage = Number.parseFloat(normalized);
    return Number.isFinite(percentage) ? width * percentage / 100 : fallback;
  }
  return parseCssPixel(normalized, fallback);
}

function getBubbleGeometry(style, defaults) {
  return {
    borderWidth: parseCssPixel(style.getPropertyValue(defaults.borderWidth), defaults.borderWidthPx),
    radius: parseCssPixel(style.getPropertyValue(defaults.radius), defaults.radiusPx),
    tailWidth: parseCssPixel(style.getPropertyValue(defaults.tailWidth), defaults.tailWidthPx),
    tailHeight: parseCssPixel(style.getPropertyValue(defaults.tailHeight), defaults.tailHeightPx),
  };
}

function syncTooltipChrome() {
  if (!tooltipChrome || !dom.tooltipLayer) return;
  if (dom.tooltipLayer.hidden) {
    tooltipChrome.style.visibility = "hidden";
    tooltipChrome.style.opacity = "0";
    return;
  }

  const layer = dom.tooltipLayer;
  const style = getComputedStyle(layer);
  const rect = layer.getBoundingClientRect();
  const geometry = getBubbleGeometry(style, {
    borderWidth: "--tooltip-border-width",
    borderWidthPx: TOOLTIP_BORDER_WIDTH_PX,
    radius: "--tooltip-radius",
    radiusPx: TOOLTIP_RADIUS_PX,
    tailWidth: "--tooltip-tail-width",
    tailWidthPx: TOOLTIP_TAIL_WIDTH_PX,
    tailHeight: "--tooltip-tail-height",
    tailHeightPx: TOOLTIP_TAIL_HEIGHT_PX,
  });
  const contentWidth = Math.max(0, rect.width - geometry.borderWidth);
  const contentHeight = Math.max(0, rect.height - geometry.borderWidth);
  const tailCenter = clampBubbleTailCenter(
    readCssOffset(style.getPropertyValue("--tooltip-arrow-offset"), contentWidth, contentWidth / 2),
    contentWidth,
    geometry.radius,
    geometry.tailWidth,
  );
  const placement = layer.dataset.placement || "top";
  const tailSide = placement === "bottom" ? "top" : "bottom";
  const svgHeight = rect.height + geometry.tailHeight;

  tooltipChrome.style.setProperty("--tooltip-border-color", style.getPropertyValue("--tooltip-border-color").trim());
  tooltipChrome.style.setProperty("--tooltip-border-width", `${geometry.borderWidth}px`);
  tooltipChrome.setAttribute("width", `${rect.width}`);
  tooltipChrome.setAttribute("height", `${svgHeight}`);
  tooltipChrome.setAttribute("viewBox", `0 0 ${rect.width} ${svgHeight}`);
  tooltipChrome.style.left = `${rect.left}px`;
  tooltipChrome.style.top = `${placement === "bottom" ? rect.top - geometry.tailHeight : rect.top}px`;
  tooltipChrome.style.visibility = style.visibility;
  tooltipChrome.style.opacity = "1";
  tooltipChromePath.setAttribute(
    "d",
    buildContinuousBubblePath({
      width: contentWidth,
      height: contentHeight,
      tailSide,
      tailCenter,
      radius: geometry.radius,
      tailWidth: geometry.tailWidth,
      tailHeight: geometry.tailHeight,
    }),
  );
  tooltipChromePath.setAttribute(
    "transform",
    `translate(${geometry.borderWidth / 2} ${geometry.borderWidth / 2})`,
  );
}

function syncEmojiPopoverChrome(popover) {
  const chrome = emojiPopoverChromes.get(popover);
  if (!chrome || !popover) return;
  const { svg, path } = chrome;
  const style = getComputedStyle(popover);
  if (popover.hidden) {
    svg.style.visibility = "hidden";
    svg.style.opacity = "0";
    return;
  }

  const rect = popover.getBoundingClientRect();
  const geometry = getBubbleGeometry(style, {
    borderWidth: "--emoji-popover-border-width",
    borderWidthPx: 1,
    radius: "--emoji-popover-radius",
    radiusPx: 12,
    tailWidth: "--emoji-popover-tail-width",
    tailWidthPx: 16,
    tailHeight: "--emoji-popover-tail-height",
    tailHeightPx: 8,
  });
  const contentWidth = Math.max(0, rect.width - geometry.borderWidth);
  const contentHeight = Math.max(0, rect.height - geometry.borderWidth);
  const tailCenter = clampBubbleTailCenter(
    readCssOffset(style.getPropertyValue("--emoji-popover-anchor-x"), contentWidth, contentWidth / 2),
    contentWidth,
    geometry.radius,
    geometry.tailWidth,
  );
  const placement = popover.dataset.placement || "top";
  const tailSide = placement === "bottom" ? "top" : "bottom";
  const svgHeight = rect.height + geometry.tailHeight;

  svg.style.setProperty("--emoji-popover-background", style.getPropertyValue("--emoji-popover-background").trim());
  svg.style.setProperty("--emoji-popover-border", style.getPropertyValue("--emoji-popover-border").trim());
  svg.style.setProperty("--emoji-popover-border-width", `${geometry.borderWidth}px`);
  svg.setAttribute("width", `${rect.width}`);
  svg.setAttribute("height", `${svgHeight}`);
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${svgHeight}`);
  svg.style.left = `${rect.left}px`;
  svg.style.top = `${placement === "bottom" ? rect.top - geometry.tailHeight : rect.top}px`;
  svg.style.visibility = style.visibility;
  svg.style.opacity = popover.classList.contains("is-emoji-popover-open")
    ? "1"
    : "0";
  path.setAttribute(
    "d",
    buildContinuousBubblePath({
      width: contentWidth,
      height: contentHeight,
      tailSide,
      tailCenter,
      radius: geometry.radius,
      tailWidth: geometry.tailWidth,
      tailHeight: geometry.tailHeight,
    }),
  );
  path.setAttribute(
    "transform",
    `translate(${geometry.borderWidth / 2} ${geometry.borderWidth / 2})`,
  );
}

function registerEmojiPopover(popover) {
  if (!popover || emojiPopoverChromes.has(popover)) return;
  const chrome = createBubbleChrome("emoji-popover-svg", 8999);
  const observer = new MutationObserver(() => syncEmojiPopoverChrome(popover));
  observer.observe(popover, {
    attributes: true,
    attributeFilter: ["class", "data-anchor", "data-placement", "hidden", "style"],
    childList: true,
    subtree: true,
  });
  emojiPopoverChromes.set(popover, { ...chrome, observer });
  syncEmojiPopoverChrome(popover);
}

function unregisterEmojiPopover(popover) {
  const chrome = emojiPopoverChromes.get(popover);
  if (!chrome) return;
  chrome.observer.disconnect();
  chrome.svg.remove();
  emojiPopoverChromes.delete(popover);
}

function registerEmojiPopoversIn(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(".emoji-popover")) registerEmojiPopover(node);
  node.querySelectorAll(".emoji-popover").forEach(registerEmojiPopover);
}

function unregisterEmojiPopoversIn(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(".emoji-popover")) unregisterEmojiPopover(node);
  node.querySelectorAll(".emoji-popover").forEach(unregisterEmojiPopover);
}

function initializeBubbleChrome() {
  if (bubbleChromeObserversReady || !dom.tooltipLayer || !dom.emojiPopover || !document.body) return;
  bubbleChromeObserversReady = true;
  ({ svg: tooltipChrome, path: tooltipChromePath } = createBubbleChrome("tooltip-layer-svg", 9999));
  registerEmojiPopover(dom.emojiPopover);

  const tooltipObserver = new MutationObserver(syncTooltipChrome);
  tooltipObserver.observe(dom.tooltipLayer, {
    attributes: true,
    attributeFilter: ["data-edge", "data-placement", "hidden", "style"],
    childList: true,
    characterData: true,
    subtree: true,
  });
  const bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach(({ addedNodes, removedNodes }) => {
      addedNodes.forEach(registerEmojiPopoversIn);
      removedNodes.forEach(unregisterEmojiPopoversIn);
    });
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", () => {
    syncTooltipChrome();
    emojiPopoverChromes.forEach((_, popover) => syncEmojiPopoverChrome(popover));
  }, { passive: true });
  syncTooltipChrome();
  emojiPopoverChromes.forEach((_, popover) => syncEmojiPopoverChrome(popover));
}

function suppressTouchTooltipClick(anchor) {
  if (anchor) suppressedTouchTooltipClickTargets.add(anchor);
}

function setTooltipTouchHover(anchor, active) {
  if (!anchor?.classList?.contains("help-button")) return;
  anchor.classList.toggle("is-touch-hover", active);
}

export function initializeUi() {
  initializeBubbleChrome();
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
    const isPresenceButton = isPresenceTooltipContext(context);
    const isStatusButton = isStatusTooltipContext(context);
    if (event.pointerType === "mouse" && isSelectTooltipContext(context)) {
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceButton || isStatusButton) return;
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;

    suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    const shouldToggleOff = (isHelpButton || isPresenceButton || isStatusButton)
      && state.ui.tooltipTarget === context.anchor
      && !dom.tooltipLayer.hidden;
    clearTouchTooltipPress();
    if (shouldToggleOff) {
      suppressTouchTooltipClick(context.anchor);
      hideTooltip();
      return;
    }

    // Un tooltip anterior de otra ancla no debe bloquear el nuevo toque.
    if (state.ui.tooltipTarget && state.ui.tooltipTarget !== context.anchor) {
      setTooltipTouchHover(state.ui.tooltipTarget, false);
      cancelScheduledTooltip();
    } else {
      hideTooltip();
    }
    touchTooltipPress = {
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
    touchTooltipTimer = window.setTimeout(() => {
      if (
        !touchTooltipPress
        || touchTooltipPress.pointerId !== event.pointerId
        || !touchTooltipPress.context.anchor.isConnected
      ) return;

      touchTooltipPress.longPress = true;
      showTooltip(touchTooltipPress.context);
    }, TOUCH_LONG_PRESS_DELAY_MS);
  });

  document.addEventListener("pointerup", (event) => {
    const context = getTooltipContext(event.target);
    const isHelpButton = context?.anchor.classList?.contains("help-button");
    const isStatusButton = isStatusTooltipContext(context);
    if (event.pointerType === "mouse" && isButtonTooltipContext(context)) {
      if (isHelpButton || isPresenceTooltipContext(context) || isStatusButton) return;
      suppressFocusTooltipUntil = performance.now() + TOOLTIP_SHOW_DELAY_MS;
      hideTooltip();
      return;
    }
    if (!isTouchPointer(event)) return;
    suppressFocusTooltipUntil = performance.now() + TOUCH_FOCUS_SUPPRESSION_MS;
    const press = touchTooltipPress;
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
    if (suppressedTouchTooltipClickTargets.delete(context.anchor)) {
      return;
    }
    const isMobileTooltipButton = context.anchor.classList?.contains("help-button")
      || isPresenceTooltipContext(context)
      || isStatusTooltipContext(context);
    if (window.matchMedia("(max-width: 680px)").matches && isMobileTooltipButton) {
      if (state.ui.tooltipTarget === context.anchor && !dom.tooltipLayer.hidden) {
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
    if (event.target === dom.playerSeekInput && state.ui.seekDragActive) return;
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

function isStatusTooltipContext(context) {
  return Boolean(context?.anchor?.matches?.(".app-status, .player-status-badge"));
}

function scheduleTooltip(context) {
  if (state.ui.seekDragActive) return;
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
    if (state.ui.seekDragActive) return;
    showTooltip(pendingContext);
  }, showDelay);
}

function cancelScheduledTooltip() {
  if (tooltipShowTimer !== null) window.clearTimeout(tooltipShowTimer);
  tooltipShowTimer = null;
  tooltipShowContext = null;
}

function showTooltip(context) {
  if (state.ui.seekDragActive) return;
  const text = context?.source?.dataset?.tooltip;
  if (!text) return;
  cancelScheduledTooltip();
  window.clearTimeout(state.ui.tooltipPressTimer);
  state.ui.tooltipPressTimer = null;
  setTooltipTouchHover(state.ui.tooltipTarget, false);
  state.ui.tooltipTarget = context.anchor;
  setTooltipTouchHover(context.anchor, true);
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
  window.cancelAnimationFrame(tooltipFrame);
  tooltipFrame = 0;
  dom.tooltipLayer.hidden = true;
  dom.tooltipLayer.textContent = "";
  dom.tooltipLayer.style.visibility = "";
  dom.tooltipLayer.style.removeProperty("--tooltip-arrow-offset");
  dom.tooltipLayer.removeAttribute("data-placement");
}

function clearTouchTooltipPress() {
  setTooltipTouchHover(touchTooltipPress?.context?.anchor, false);
  if (touchTooltipTimer !== null) window.clearTimeout(touchTooltipTimer);
  touchTooltipTimer = null;
  touchTooltipPress = null;
}

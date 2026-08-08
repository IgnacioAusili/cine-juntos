import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { setConnection } from "./session-ui.js";
import { createForeignDocumentIcon } from "./foreign-lucide-icon.js";

const TOOLTIP_ANCHOR_SELECTOR = "button, [role='button'], a, label, summary, input, select, textarea";
const TOOLTIP_VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 4;

let tooltipFrame = 0;

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
  document.querySelectorAll("[data-tooltip][title]").forEach((element) => {
    element.removeAttribute("title");
  });
}

export { setConnection };

export function wireTooltipEvents() {
  if (!dom.tooltipLayer) return;

  document.addEventListener("pointerover", (event) => {
    const context = getTooltipContext(event.target);
    if (context) showTooltip(context);
  });

  document.addEventListener("pointerout", (event) => {
    if (!state.ui.tooltipTarget) return;
    if (event.relatedTarget instanceof Node && state.ui.tooltipTarget.contains(event.relatedTarget)) return;
    const context = getTooltipContext(event.target);
    if (context?.anchor === state.ui.tooltipTarget) hideTooltip();
  });

  document.addEventListener("pointermove", (event) => {
    if (!state.ui.tooltipTarget) return;
    if (!isPointInsideElement(state.ui.tooltipTarget, event.clientX, event.clientY)) hideTooltip();
  });

  document.addEventListener("pointerdown", (event) => {
    const context = getTooltipContext(event.target);
    if (!context) return;
    if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) return;
    showTooltip(context);
    window.clearTimeout(state.ui.tooltipPressTimer);
    state.ui.tooltipPressTimer = window.setTimeout(hideTooltip, 2200);
  });

  document.addEventListener("focusin", (event) => {
    const context = getTooltipContext(event.target);
    if (context) showTooltip(context);
  });

  document.addEventListener("focusout", (event) => {
    if (getTooltipContext(event.target)) hideTooltip();
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

  return {
    source: nestedSource,
    anchor: getTooltipAnchor(nestedSource),
  };
}

function getTooltipAnchor(source) {
  if (source.classList?.contains("chat-collapse-icon-anchor")) return source;
  return source.closest?.(TOOLTIP_ANCHOR_SELECTOR) || source;
}

function showTooltip(context) {
  const text = context?.source?.dataset?.tooltip;
  if (!text) return;
  state.ui.tooltipTarget = context.anchor;
  dom.tooltipLayer.textContent = text;
  dom.tooltipLayer.hidden = false;
  dom.tooltipLayer.style.visibility = "hidden";
  dom.tooltipLayer.style.left = "0px";
  dom.tooltipLayer.style.top = "0px";

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
  const top = candidateBelow + tooltipRect.height <= window.innerHeight - TOOLTIP_VIEWPORT_PADDING
    ? candidateBelow
    : candidateAbove >= TOOLTIP_VIEWPORT_PADDING
      ? candidateAbove
      : Math.min(Math.max(candidateBelow, TOOLTIP_VIEWPORT_PADDING), maxTop);

  dom.tooltipLayer.style.top = `${top}px`;
  dom.tooltipLayer.style.left = `${left}px`;
}

export function hideTooltip() {
  state.ui.tooltipTarget = null;
  window.clearTimeout(state.ui.tooltipPressTimer);
  window.cancelAnimationFrame(tooltipFrame);
  tooltipFrame = 0;
  dom.tooltipLayer.hidden = true;
  dom.tooltipLayer.style.visibility = "";
}

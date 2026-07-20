import { dom } from "../core/dom.js";
import { state } from "../core/state.js";
import { setConnection } from "./session-ui.js";

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

export function normalizeTooltips() {
  document.querySelectorAll("[data-tooltip][title]").forEach((element) => {
    element.removeAttribute("title");
  });
}

export { setConnection };

export function wireTooltipEvents() {
  if (!dom.tooltipLayer) return;

  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target && isPointInsideElement(target, event.clientX, event.clientY)) showTooltip(target);
  });

  document.addEventListener("pointerout", (event) => {
    if (!state.ui.tooltipTarget) return;
    if (event.relatedTarget instanceof Node && state.ui.tooltipTarget.contains(event.relatedTarget)) return;
    const target = event.target.closest?.("[data-tooltip]");
    if (target === state.ui.tooltipTarget) hideTooltip();
  });

  document.addEventListener("pointermove", (event) => {
    if (!state.ui.tooltipTarget) return;
    if (!isPointInsideElement(state.ui.tooltipTarget, event.clientX, event.clientY)) hideTooltip();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (!target) return;
    if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) return;
    showTooltip(target);
    window.clearTimeout(state.ui.tooltipPressTimer);
    state.ui.tooltipPressTimer = window.setTimeout(hideTooltip, 2200);
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target) showTooltip(target);
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.("[data-tooltip]")) hideTooltip();
  });

  window.addEventListener("resize", hideTooltip);
  window.addEventListener("scroll", hideTooltip, true);
}

export function refreshTooltipForTarget(target) {
  if (!dom.tooltipLayer || state.ui.tooltipTarget !== target || dom.tooltipLayer.hidden) return;
  const text = target?.dataset?.tooltip;
  if (!text) return;
  dom.tooltipLayer.textContent = text;
  positionTooltip(target);
}

function isPointInsideElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function showTooltip(target) {
  const text = target.dataset.tooltip;
  if (!text) return;
  state.ui.tooltipTarget = target;
  dom.tooltipLayer.textContent = text;
  dom.tooltipLayer.hidden = false;
  positionTooltip(target);
}

function positionTooltip(target) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = dom.tooltipLayer.getBoundingClientRect();
  const viewportPadding = 8;
  const topCandidate = rect.top - tooltipRect.height - 8;
  const top = topCandidate >= viewportPadding ? topCandidate : rect.bottom + 8;
  const left = Math.min(
    window.innerWidth - tooltipRect.width - viewportPadding,
    Math.max(viewportPadding, rect.left + rect.width / 2 - tooltipRect.width / 2),
  );

  dom.tooltipLayer.style.top = `${Math.max(viewportPadding, top)}px`;
  dom.tooltipLayer.style.left = `${left}px`;
}

function hideTooltip() {
  state.ui.tooltipTarget = null;
  window.clearTimeout(state.ui.tooltipPressTimer);
  dom.tooltipLayer.hidden = true;
}

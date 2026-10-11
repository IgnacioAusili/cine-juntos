import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { buildContinuousBubblePath, clampBubbleTailCenter } from "../core/continuous-bubble.js?v=20261010-file-size-refactor-02";
import { TOOLTIP_VIEWPORT_PADDING, TOOLTIP_GAP, TOOLTIP_BORDER_WIDTH_PX, TOOLTIP_RADIUS_PX, TOOLTIP_TAIL_WIDTH_PX, TOOLTIP_TAIL_HEIGHT_PX } from "./tooltip-constants.js?v=20261010-file-size-refactor-02";

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
  // El chrome tiene que pertenecer al app-shell para mantenerse dentro de la
  // top layer cuando el shell entra en fullscreen nativo. Así no hace falta
  // volver a dibujar la cola con un pseudo-elemento CSS distinto.
  const chromeHost = document.querySelector(".app-shell") || document.body;
  chromeHost.append(svg);
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

export function syncTooltipChrome() {
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
  tooltipChrome.dataset.placement = placement;
  tooltipChrome.dataset.animationState = layer.dataset.animationState || "visible";
  const tailSide = placement === "bottom" ? "top" : "bottom";
  const svgHeight = rect.height + geometry.tailHeight;
  // getBoundingClientRect incluye el translate de entrada/salida. Usar el top
  // calculado del layer mantiene el texto alineado con el cuerpo del SVG.
  const layerLeft = parseCssPixel(style.left, rect.left);
  const layerTop = parseCssPixel(style.top, rect.top);

  tooltipChrome.style.setProperty("--tooltip-border-color", style.getPropertyValue("--tooltip-border-color").trim());
  tooltipChrome.style.setProperty("--tooltip-border-width", `${geometry.borderWidth}px`);
  tooltipChrome.setAttribute("width", `${rect.width}`);
  tooltipChrome.setAttribute("height", `${svgHeight}`);
  tooltipChrome.setAttribute("viewBox", `0 0 ${rect.width} ${svgHeight}`);
  tooltipChrome.style.left = `${layerLeft}px`;
  tooltipChrome.style.top = `${placement === "bottom" ? layerTop - geometry.tailHeight : layerTop}px`;
  tooltipChrome.style.visibility = style.visibility;
  tooltipChrome.style.removeProperty("opacity");
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

export function setTooltipChromeTransition(value) {
  if (!tooltipChrome) return;
  if (value) tooltipChrome.style.setProperty("transition", value);
  else tooltipChrome.style.removeProperty("transition");
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

export function registerEmojiPopoversIn(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(".emoji-popover")) registerEmojiPopover(node);
  node.querySelectorAll(".emoji-popover").forEach(registerEmojiPopover);
}

export function unregisterEmojiPopoversIn(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(".emoji-popover")) unregisterEmojiPopover(node);
  node.querySelectorAll(".emoji-popover").forEach(unregisterEmojiPopover);
}

export function initializeBubbleChrome() {
  if (bubbleChromeObserversReady || !dom.tooltipLayer || !dom.emojiPopover || !document.body) return;
  bubbleChromeObserversReady = true;
  ({ svg: tooltipChrome, path: tooltipChromePath } = createBubbleChrome("tooltip-layer-svg", 9999));
  registerEmojiPopover(dom.emojiPopover);

  const tooltipObserver = new MutationObserver(syncTooltipChrome);
  tooltipObserver.observe(dom.tooltipLayer, {
    attributes: true,
    attributeFilter: ["data-animation-state", "data-edge", "data-placement", "hidden", "style"],
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

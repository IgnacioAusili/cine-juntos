import { dom } from "../core/dom.js";
import { initializeBubbleChrome } from "./tooltip/tooltip-bubble-chrome.js";
import { wireTooltipEvents } from "./tooltip/tooltip-events.js";
import { hideTooltip, refreshTooltipForTarget } from "./tooltip/tooltip-behavior.js";
export { wireTooltipEvents } from "./tooltip/tooltip-events.js";
export { hideTooltip, refreshTooltipForTarget } from "./tooltip/tooltip-behavior.js";
import { state } from "../core/state.js";
import {
  buildContinuousBubblePath,
  clampBubbleTailCenter,
} from "../core/continuous-bubble.js";
import { setConnection } from "./session/session-ui.js";
import { createForeignDocumentIcon } from "./foreign-lucide-icon.js";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js";



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

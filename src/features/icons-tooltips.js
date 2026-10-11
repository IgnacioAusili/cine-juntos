import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { initializeBubbleChrome } from "./tooltip-bubble-chrome.js?v=20261011-chat-interaction-fixes-01";
import { wireTooltipEvents } from "./tooltip-events.js?v=20261011-chat-ui-fixes-03";
import { hideTooltip, refreshTooltipForTarget } from "./tooltip-behavior.js?v=20261011-chat-ui-fixes-03";
export { wireTooltipEvents } from "./tooltip-events.js?v=20261011-chat-ui-fixes-03";
export { hideTooltip, refreshTooltipForTarget } from "./tooltip-behavior.js?v=20261011-chat-ui-fixes-03";
import { state } from "../core/state.js?v=20261010-file-size-refactor-02";
import {
  buildContinuousBubblePath,
  clampBubbleTailCenter,
} from "../core/continuous-bubble.js?v=20261010-file-size-refactor-02";
import { setConnection } from "./session-ui.js?v=20261010-file-size-refactor-02";
import { createForeignDocumentIcon } from "./foreign-lucide-icon.js?v=20261010-file-size-refactor-02";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js?v=20261010-file-size-refactor-02";



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

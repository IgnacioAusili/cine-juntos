import { dom } from "../../core/dom.js";

const MOBILE_PORTRAIT_QUERY = "(max-width: 680px) and (orientation: portrait)";
const PLACEMENT_ATTRIBUTE = "data-inside-chat-placement";
const PLACEMENT_VALUE = "side";
const EDGE_GAP_PX = 8;
const BUTTON_GAP_PX = 10;
const CLOSE_PLACEMENT_CLEANUP_DELAY_MS = 220;

let syncFrameId = 0;
let placementWired = false;
let frameResizeObserver = null;
let sessionAttributeObserver = null;
let placementCleanupTimer = 0;
let preservePlacementWhileClosing = false;

function isEligibleViewport() {
  return window.matchMedia?.(MOBILE_PORTRAIT_QUERY).matches === true
    && dom.sessionView?.dataset.chatDock === "bottom"
    && !dom.playerFrame?.classList.contains("mini-player-surface");
}

function parseCssPixels(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clearPlacement() {
  if (!dom.playerChat) return;
  dom.playerChat.removeAttribute(PLACEMENT_ATTRIBUTE);
  [
    "--inside-chat-placement-top",
    "--inside-chat-placement-left",
    "--inside-chat-placement-width",
    "--inside-chat-placement-height",
    "--inside-chat-placement-max-height",
  ].forEach((property) => dom.playerChat.style.removeProperty(property));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function syncInsideChatPanelPlacement() {
  if (!dom.playerFrame || !dom.playerChat || !dom.playerChatToggleButton) return;

  if (!dom.playerFrame.classList.contains("chat-inside-open")) {
    if (preservePlacementWhileClosing) return;
    clearPlacement();
    return;
  }

  preservePlacementWhileClosing = false;
  if (placementCleanupTimer) {
    window.clearTimeout(placementCleanupTimer);
    placementCleanupTimer = 0;
  }
  if (!isEligibleViewport()) {
    clearPlacement();
    return;
  }

  // Medir siempre desde el estilo base evita que una rotación o un cambio de
  // ancho reutilice el left/height calculado para el viewport anterior.
  clearPlacement();

  const frameRect = dom.playerFrame.getBoundingClientRect();
  const buttonRect = dom.playerChatToggleButton.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0 || buttonRect.width <= 0) return;

  const chatStyles = getComputedStyle(dom.playerChat);
  const maxHeight = Math.max(
    0,
    parseCssPixels(chatStyles.getPropertyValue("--player-chat-max-height"), 330),
  );
  const naturalWidth = Math.max(0, dom.playerChat.getBoundingClientRect().width);
  const topInset = Math.max(0, parseCssPixels(chatStyles.top, 48));
  const bottomInset = Math.max(0, parseCssPixels(chatStyles.bottom, 8));
  const verticalSpace = frameRect.height - topInset - bottomInset;

  // La composición vertical existente sigue siendo la preferida si puede
  // alojar el tamaño máximo. Solo se cambia de eje cuando realmente no entra.
  if (maxHeight <= verticalSpace + 0.5) return;

  const frameButtonLeft = buttonRect.left - frameRect.left;
  const frameButtonRight = buttonRect.right - frameRect.left;
  const leftSpace = frameButtonLeft - BUTTON_GAP_PX - EDGE_GAP_PX;
  const rightSpace = frameRect.width - frameButtonRight - BUTTON_GAP_PX - EDGE_GAP_PX;
  const useLeftSide = leftSpace >= rightSpace;
  const availableSideWidth = Math.max(0, useLeftSide ? leftSpace : rightSpace);
  const panelWidth = Math.min(naturalWidth, availableSideWidth);
  const panelHeight = Math.min(maxHeight, Math.max(0, frameRect.height - EDGE_GAP_PX * 2));
  if (panelWidth <= 0 || panelHeight <= 0) return;

  const rawLeft = useLeftSide
    ? frameButtonLeft - BUTTON_GAP_PX - panelWidth
    : frameButtonRight + BUTTON_GAP_PX;
  const left = clamp(
    rawLeft,
    EDGE_GAP_PX,
    frameRect.width - EDGE_GAP_PX - panelWidth,
  );
  const rawTop = buttonRect.top - frameRect.top + buttonRect.height / 2 - panelHeight / 2;
  const top = clamp(
    rawTop,
    EDGE_GAP_PX,
    frameRect.height - EDGE_GAP_PX - panelHeight,
  );

  dom.playerChat.setAttribute(PLACEMENT_ATTRIBUTE, PLACEMENT_VALUE);
  dom.playerChat.style.setProperty("--inside-chat-placement-top", `${Math.round(top)}px`);
  dom.playerChat.style.setProperty("--inside-chat-placement-left", `${Math.round(left)}px`);
  dom.playerChat.style.setProperty("--inside-chat-placement-width", `${Math.round(panelWidth)}px`);
  dom.playerChat.style.setProperty("--inside-chat-placement-height", `${Math.round(panelHeight)}px`);
  dom.playerChat.style.setProperty("--inside-chat-placement-max-height", `${Math.round(panelHeight)}px`);
}

export function preserveInsideChatPanelPlacementWhileClosing() {
  preservePlacementWhileClosing = true;
  if (placementCleanupTimer) window.clearTimeout(placementCleanupTimer);
  placementCleanupTimer = window.setTimeout(() => {
    placementCleanupTimer = 0;
    preservePlacementWhileClosing = false;
    if (!dom.playerFrame?.classList.contains("chat-inside-open")) clearPlacement();
  }, CLOSE_PLACEMENT_CLEANUP_DELAY_MS);
}

function schedulePlacementSync() {
  if (syncFrameId) return;
  syncFrameId = window.requestAnimationFrame(() => {
    syncFrameId = 0;
    syncInsideChatPanelPlacement();
  });
}

export function wireInsideChatPanelPlacement() {
  if (placementWired) return;
  placementWired = true;

  window.addEventListener("resize", schedulePlacementSync, { passive: true });
  window.addEventListener("orientationchange", schedulePlacementSync, { passive: true });
  window.visualViewport?.addEventListener("resize", schedulePlacementSync, { passive: true });

  if ("ResizeObserver" in window) {
    frameResizeObserver = new ResizeObserver(schedulePlacementSync);
    frameResizeObserver.observe(dom.playerFrame);
  }
  if ("MutationObserver" in window && dom.sessionView) {
    sessionAttributeObserver = new MutationObserver(schedulePlacementSync);
    sessionAttributeObserver.observe(dom.sessionView, {
      attributes: true,
      attributeFilter: ["class", "data-chat-dock"],
    });
  }
}

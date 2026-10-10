// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js?v=20261008";
import { shouldAnchorChatCollapseHandleInHeader } from "./chat-collapse-header-layout.js?v=20261008";
import { CHAT_DOCKS, CHAT_DOCK_META, withShortcutHint } from "../../core/utils.js";
import { hydrateIcons, hideTooltip, refreshTooltipForTarget } from "../icons-tooltips.js?v=20261009-tooltip-slide-04";
import { focusFullscreenWorkspace } from "../session-ui.js?v=20261008";
import {
  cancelIdentityEditing,
  syncNameInputWidth,
} from "../presence.js?v=20261008";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
  resetInsideUnread,
  resetPageUnread,
  syncUnreadBadgesWithVisibility,
} from "./unread-counters.js?v=20261009-bottom-chat-expand-center-02-scroll-unread-visible-01-hidden-tab-scroll-01-input-boundary-01-scroll-unlocked-01-dock-switch-stacked-viewport-01-right-chat-curtain-input-01-right-chat-close-settle-01-right-chat-viewport-curtain-01";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20261008";
import { focusChatInput } from "./chat-input-focus.js";
import { restorePageScrollAfterRightChatCollapse } from "./chat-scroll-preservation.js?v=20261008";
import {
  CHAT_DOCK_TRANSITIONS,
  resolveChatDockTransition,
} from "./dock-transition-router.js?v=20261009-dock-switch-stacked-viewport-01";
import {
  preserveInsideChatPanelPlacementWhileClosing,
  syncInsideChatPanelPlacement,
  wireInsideChatPanelPlacement,
} from "../player/inside-chat-layout.js?v=20261008";
import { syncComponentAspectLayoutNow } from "./component-aspect-layout.js?v=20261008-unified-panel-layout-01-shared-viewport-fit-01";

const AUTO_COLLAPSE_DELAY_MS = 5000;
const AUTO_EXPAND_INSIDE_KEY = "cine-juntos-chat-auto-expand-inside";
const AUTO_EXPAND_EXTERNAL_KEY = "cine-juntos-chat-auto-expand-external";
const EXTERNAL_CHAT_COLLAPSED_KEY = "cine-juntos-chat-collapsed";
const CHAT_STYLE_KEY = "cine-juntos-chat-style";
const CHAT_LAYOUT_SETTLE_MS = 280;
const COLLAPSE_HANDLE_HIDE_MS = CHAT_LAYOUT_SETTLE_MS + 40;
// El dock lateral hereda esta duración de la transición flex de escritorio.
const RIGHT_CHAT_LAYOUT_TRANSITION_MS = 350;
const CHAT_SCROLL_SNAP_LOCK_MS = 900;
const BOTTOM_CHAT_CURTAIN_MS = 320;
const BOTTOM_CHAT_SCROLL_TIMEOUT_MS = 1200;
const BOTTOM_DOCK_UNION_REVEAL_PX = 0;
const BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS = 1200;
// El cambio inferior → lateral debe conservar la misma velocidad que la
// expansión natural del botón lateral.
const BOTTOM_TO_RIGHT_LAYOUT_MS = RIGHT_CHAT_LAYOUT_TRANSITION_MS;
// En fullscreen el dock cambia de superficie (lateral/inferior). La salida
// debe terminar antes de montar la nueva superficie para que no haya un frame
// en el que ambos estados aparezcan juntos.
const FULLSCREEN_DOCK_OUT_MS = 260;
const FULLSCREEN_DOCK_IN_MS = 320;
let responsiveSessionLayoutObserver = null;
let responsiveSessionLayoutFrame = 0;

let layoutAdjustmentTimer = 0;
let collapseHandleOffsetTimer = 0;
let expandScrollTimer = 0;
let chatScrollSnapLockTimer = 0;
let pendingBottomToRightSwitch = null;
let pendingChatDockSwitch = null;
let externalChatVisualMotionTimer = 0;
let bottomChatTransition = null;
let pendingRightDockCollapseScrollTop = null;
let chatDockHandleSwitchTimer = 0;

function getVideoAreaRect() {
  if (!dom.videoArea) return null;
  const rect = dom.videoArea.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function isStackedSessionLayout() {
  if (!dom.sessionView) return false;
  return getComputedStyle(dom.sessionView)
    .getPropertyValue("--session-layout-mode")
    .trim() === "stacked";
}

function setResponsiveSessionLayout(stacked) {
  if (!dom.sessionView) return;
  dom.sessionView.classList.toggle("layout-stacked", stacked);
  dom.sessionView.style.setProperty(
    "--session-layout-mode",
    stacked ? "stacked" : "side-by-side",
  );
}

function measureResponsiveSessionLayout() {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) return;

  const isCoarsePointer = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  ).matches;
  if (dom.sessionView.dataset.chatDock !== "right" || isCoarsePointer) {
    setResponsiveSessionLayout(isCoarsePointer);
    syncExternalChatCollapseHandleOffset();
    return;
  }

  const isCollapsed = dom.sessionView.classList.contains("chat-collapsed");
  if (
    dom.sessionView.classList.contains("chat-layout-transitioning")
    || dom.sessionView.classList.contains("chat-dock-switching")
  ) return;

  const wasStacked = dom.sessionView.classList.contains("layout-stacked");
  const previousChatAreaStyle = isCollapsed ? dom.chatArea.getAttribute("style") : null;
  dom.sessionView.classList.add("layout-fit-check");
  dom.sessionView.classList.remove("layout-stacked");

  let stacked = false;
  try {
    if (isCollapsed) {
      // Un panel colapsado mide cero y no permite saber si cabe en la nueva
      // ventana. Recuperar su geometría solo durante esta lectura mantiene
      // estable el estado del chat y evita dejar obsoleto el modo responsive.
      dom.chatArea.style.setProperty("flex-basis", "var(--chat-panel-width)");
      dom.chatArea.style.setProperty("width", "var(--chat-panel-width)");
      dom.chatArea.style.setProperty("min-width", "0");
      dom.chatArea.style.setProperty("opacity", "1");
      dom.chatArea.style.setProperty("pointer-events", "auto");
    }

    const videoRect = dom.videoArea?.getBoundingClientRect();
    const chatRect = dom.chatArea.getBoundingClientRect();
    stacked = Boolean(
      videoRect
        && chatRect.width > 0
        && chatRect.top > videoRect.top + 1,
    );
  } finally {
    if (isCollapsed) {
      if (previousChatAreaStyle === null) {
        dom.chatArea.removeAttribute("style");
      } else {
        dom.chatArea.setAttribute("style", previousChatAreaStyle);
      }
    }
    dom.sessionView.classList.remove("layout-fit-check");
    if (wasStacked) dom.sessionView.classList.add("layout-stacked");
  }

  setResponsiveSessionLayout(stacked);
  syncExternalChatCollapseHandleOffset();
}

function scheduleResponsiveSessionLayoutMeasure() {
  if (responsiveSessionLayoutFrame) return;
  responsiveSessionLayoutFrame = window.requestAnimationFrame(() => {
    responsiveSessionLayoutFrame = 0;
    measureResponsiveSessionLayout();
  });
}

export function wireResponsiveSessionLayout() {
  if (!dom.sessionView || !dom.workspace) return;

  scheduleResponsiveSessionLayoutMeasure();
  if ("ResizeObserver" in window && !responsiveSessionLayoutObserver) {
    responsiveSessionLayoutObserver = new ResizeObserver(
      scheduleResponsiveSessionLayoutMeasure,
    );
    responsiveSessionLayoutObserver.observe(dom.workspace);
  }
  window.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.visualViewport?.addEventListener("resize", scheduleResponsiveSessionLayoutMeasure, {
    passive: true,
  });
  window.addEventListener(
    "chat-layout-settled",
    scheduleResponsiveSessionLayoutMeasure,
    { passive: true },
  );
}

function isMobilePortraitChatViewport() {
  return window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches;
}

function isMobileLandscapeRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
}

function isMobileLandscapeFullscreenBottomDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "bottom"
    && isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
}

function isMobilePortraitRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isMobilePortraitChatViewport();
}

function isRightChatViewportOverlay() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && window.matchMedia("(max-width: 680px)").matches;
}

// La grilla debe cambiar de una vez para evitar que el texto se reenvuelva en
// cada frame. Esta transición FLIP conserva el movimiento visual del video sin
// volver a calcular el contenido del chat ni los controles durante el trayecto.
function animateExternalChatLayoutFrom(previousRect) {
  if (!dom.sessionView || !dom.videoArea || !previousRect) return;

  if (
    isStackedSessionLayout()
    && (dom.sessionView.dataset.chatDock || "right") === "bottom"
  ) {
    return;
  }

  // El dock lateral copia la cortina del prototipo: se anima el ancho del
  // panel, sin aplicar escala al area del video ni modificar su alto.
  if ((dom.sessionView.dataset.chatDock || "right") === "right") return;

  if (externalChatVisualMotionTimer) {
    window.clearTimeout(externalChatVisualMotionTimer);
    externalChatVisualMotionTimer = 0;
  }
  dom.sessionView.classList.remove("chat-layout-visual-motion");
  dom.sessionView.style.removeProperty("--chat-layout-video-scale-x");
  dom.sessionView.style.removeProperty("--chat-layout-video-scale-y");

  const nextRect = getVideoAreaRect();
  if (!nextRect) return;
  const scaleX = previousRect.width / nextRect.width;
  const scaleY = previousRect.height / nextRect.height;
  if (Math.abs(1 - scaleX) < 0.01 && Math.abs(1 - scaleY) < 0.01) return;

  dom.sessionView.style.setProperty("--chat-layout-video-scale-x", String(scaleX));
  dom.sessionView.style.setProperty("--chat-layout-video-scale-y", String(scaleY));
  dom.sessionView.classList.add("chat-layout-visual-motion");
  // Confirma el estado inicial antes del siguiente frame; sin esta lectura el
  // navegador puede agrupar ambos valores y convertir la transición en salto.
  void dom.videoArea.offsetWidth;

  window.requestAnimationFrame(() => {
    if (!dom.sessionView?.classList.contains("chat-layout-visual-motion")) return;
    dom.sessionView.style.setProperty("--chat-layout-video-scale-x", "1");
    dom.sessionView.style.setProperty("--chat-layout-video-scale-y", "1");
  });

  externalChatVisualMotionTimer = window.setTimeout(() => {
    externalChatVisualMotionTimer = 0;
    dom.sessionView?.classList.remove("chat-layout-visual-motion");
    dom.sessionView?.style.removeProperty("--chat-layout-video-scale-x");
    dom.sessionView?.style.removeProperty("--chat-layout-video-scale-y");
  }, CHAT_LAYOUT_SETTLE_MS + 40);
}

function isFullscreenPageActive() {
  return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
}

function getPageScrollContainer() {
  if (!isFullscreenPageActive()) return window;
  return dom.sessionView?.closest(".app-shell") || document.scrollingElement || document.documentElement;
}

function getPageScrollTop() {
  if (!isFullscreenPageActive()) return Math.round(window.scrollY || 0);
  return Math.round(getPageScrollContainer().scrollTop || 0);
}

function getPageScrollMax() {
  if (!isFullscreenPageActive()) {
    return Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  }

  const container = getPageScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
}

function getElementPageTop(element) {
  if (!element) return 0;
  if (!isFullscreenPageActive()) {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  const container = getPageScrollContainer();
  const containerRect = container.getBoundingClientRect();
  return element.getBoundingClientRect().top - containerRect.top + (container.scrollTop || 0);
}

function scrollPageTo(top, behavior = "auto") {
  if (isFullscreenPageActive()) {
    getPageScrollContainer().scrollTo({ top, behavior });
    return;
  }

  window.scrollTo({ top, behavior });
}

export function captureExternalChatCollapseScroll() {
  pendingRightDockCollapseScrollTop =
    !dom.sessionView?.classList.contains("chat-collapsed") && isMobileLandscapeRightDock()
      ? getPageScrollTop()
      : null;
}

function getAutoExpandTooltip() {
  return "Se abre al recibir mensajes y se oculta al responder";
}

function updateAutoExpandSwitch(button, enabled, label) {
  if (!button) return;
  const tooltip = getAutoExpandTooltip();
  button.classList.toggle("active", enabled);
  button.setAttribute("aria-checked", String(enabled));
  button.setAttribute("aria-label", `Autoexpandir ${label}`);
  button.dataset.tooltip = tooltip;
  button.removeAttribute("title");
  refreshTooltipForTarget(button);
}

function clearAutoCollapseTimer(isOverlay) {
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  const timerId = state.chat[timerKey];
  if (timerId) {
    window.clearTimeout(timerId);
    state.chat[timerKey] = null;
  }
}

export function revealBottomDockUnion(behavior = "smooth") {
  if (!dom.chatArea) return;

  syncExternalChatCollapseHandleOffset();
  if (isMobileLandscapeFullscreenBottomDock()) return;
  const nextBehavior = isFullscreenPageActive() ? "auto" : behavior;
  const chatTop = getBottomDockChatScrollTop();
  scrollPageTo(Math.max(0, Math.round(chatTop - BOTTOM_DOCK_UNION_REVEAL_PX)), nextBehavior);
  window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);
}

function getBottomDockChatScrollTop() {
  if (!dom.chatArea) return 0;
  const chatTop = Math.max(0, Math.round(getElementPageTop(dom.chatArea)));
  return Math.min(getPageScrollMax(), chatTop);
}

export function scrollToVideoPosition(behavior = "smooth") {
  if (!dom.sessionView || dom.sessionView.hidden) return;

  lockChatScrollSnapDuringProgrammaticScroll();
  const targetTop = getBottomToRightScrollTop();
  scrollPageTo(targetTop, behavior);
}

function scheduleMessageTimeAdjustmentAfterLayout() {
  if (layoutAdjustmentTimer) {
    window.clearTimeout(layoutAdjustmentTimer);
  }
  layoutAdjustmentTimer = window.setTimeout(() => {
    layoutAdjustmentTimer = 0;
    scheduleMessageTimeAdjustment();
  }, CHAT_LAYOUT_SETTLE_MS);
}

function setCollapseHandleTransitioning(
  isTransitioning,
  settleDelayMs = COLLAPSE_HANDLE_HIDE_MS,
) {
  if (!dom.collapseChatButton) return;

  if (isTransitioning) hideTooltip();

  const collapseHandleButtons = [dom.collapseChatButton, dom.expandChatButton].filter(Boolean);
  const collapseHandleZones = collapseHandleButtons
    .map((button) => button.closest(".chat-collapse-hover-zone"))
    .filter(Boolean);

  if (state.chat.collapseHandleTransitionTimer) {
    window.clearTimeout(state.chat.collapseHandleTransitionTimer);
    state.chat.collapseHandleTransitionTimer = null;
  }

  collapseHandleButtons.forEach((button) => {
    button.classList.toggle("is-transitioning", isTransitioning);
  });
  collapseHandleZones.forEach((zone) => {
    zone.classList.toggle("is-transitioning", isTransitioning);
  });
  dom.sessionView?.classList.toggle("chat-layout-transitioning", isTransitioning);
  const messageForm = dom.chatArea?.querySelector(".message-form");
  if (
    isTransitioning
    && dom.sessionView?.dataset.chatDock === "right"
    && !isRightChatViewportOverlay()
  ) {
    const rightDockUsesViewportWidth = isMobilePortraitRightDock()
      || isMobileLandscapeRightDock();
    messageForm?.style.setProperty(
      "width",
      rightDockUsesViewportWidth
        ? "calc(var(--app-viewport-width, 100vw) - 36px)"
        : "calc(var(--chat-panel-width) - 37px)",
    );
  }
  if (!isTransitioning) return;

  state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
    // El timer propio del collapse puede vencer antes que la segunda fase
    // del cambio de dock (por ejemplo, lateral -> inferior). Mantener los
    // handles bloqueados mientras haya un switch pendiente evita que reaparezca
    // la flecha de la superficie que todavía se está desmontando.
    if (pendingChatDockSwitch || pendingBottomToRightSwitch) {
      state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
        if (pendingChatDockSwitch || pendingBottomToRightSwitch) {
          setCollapseHandleTransitioning(true, 80);
        } else {
          setCollapseHandleTransitioning(false);
        }
      }, 80);
      return;
    }

    collapseHandleButtons.forEach((button) => {
      button.classList.remove("is-transitioning");
    });
    collapseHandleZones.forEach((zone) => {
      zone.classList.remove("is-transitioning");
    });
    dom.sessionView?.classList.remove("chat-layout-transitioning");
    messageForm?.style.removeProperty("width");
    state.chat.collapseHandleTransitionTimer = null;
    syncExternalChatCollapseHandleOffset();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);
    });
    window.dispatchEvent(new Event("chat-layout-settled"));
  }, settleDelayMs);
}

function keepChatDockHandlesHidden() {
  if (!dom.sessionView) return;

  if (chatDockHandleSwitchTimer) {
    window.clearTimeout(chatDockHandleSwitchTimer);
    chatDockHandleSwitchTimer = 0;
  }
  dom.sessionView.classList.add("chat-dock-handle-switching");
}

function scheduleChatDockHandlesReveal(delayMs) {
  if (!dom.sessionView) return;

  if (chatDockHandleSwitchTimer) {
    window.clearTimeout(chatDockHandleSwitchTimer);
  }
  chatDockHandleSwitchTimer = window.setTimeout(() => {
    chatDockHandleSwitchTimer = 0;
    dom.sessionView?.classList.remove("chat-dock-handle-switching");
  }, Math.max(0, delayMs));
}

function scheduleAutoCollapse(isOverlay) {
  const enabled = isOverlay
    ? state.chat.autoExpandInsideEnabled
    : state.chat.autoExpandExternalEnabled;
  const autoOpenedKey = isOverlay ? "autoOpenedInside" : "autoOpenedExternal";
  if (!isOverlay && isMobileLandscapeFullscreenBottomDock()) return;
  if (!enabled || !state.chat[autoOpenedKey]) return;

  clearAutoCollapseTimer(isOverlay);
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  state.chat[timerKey] = window.setTimeout(() => {
    state.chat[timerKey] = null;
    if (isOverlay) {
      if (!dom.playerFrame.classList.contains("chat-inside-open")) return;
      setInsideChatVisible(false, { source: "auto-timeout" });
    } else {
      if (isMobileLandscapeFullscreenBottomDock()) return;
      if (dom.sessionView.classList.contains("chat-collapsed")) return;
      setExternalChatCollapsed(true, { source: "auto-timeout" });
    }
  }, AUTO_COLLAPSE_DELAY_MS);
}

export function setInsideChatVisible(visible, options = {}) {
  wireInsideChatPanelPlacement();
  const source = options.source || "user";
  clearAutoCollapseTimer(true);
  if (visible) {
    state.chat.autoOpenedInside = source === "auto";
    // La apertura con Tab ocurre mientras el overlay todavía está en su
    // transición de entrada; en ese momento el detector geométrico aún puede
    // considerarlo invisible. La apertura manual ya implica que el usuario
    // está atendiendo el chat, por lo que el contador debe desaparecer aquí.
    if (source !== "auto") resetInsideUnread();
  } else {
    state.chat.autoOpenedInside = false;
  }
  if (!visible) cancelIdentityEditing();
  dom.playerFrame.classList.toggle("chat-inside-open", visible);
  if (visible) {
    syncInsideChatPanelPlacement();
  } else {
    preserveInsideChatPanelPlacementWhileClosing();
  }
  dom.playerChatToggleButton.classList.toggle("active", visible);
  dom.playerChatToggleButton.setAttribute("aria-pressed", String(visible));
  const shortcutTooltip = withShortcutHint(visible ? "Ocultar chat" : "Mostrar chat", "Tab");
  dom.playerChatToggleButton.dataset.tooltip = shortcutTooltip;
  dom.playerChatToggleButton.setAttribute("aria-label", shortcutTooltip);
  dom.playerChatToggleButton.removeAttribute("title");

  if (visible) {
    dom.overlayMessages.scrollTop = dom.overlayMessages.scrollHeight;
  }
  syncInsideChatPanelOffset();
  if (visible && source !== "auto") {
    window.requestAnimationFrame(() => {
      focusChatInput(dom.overlayMessageInput);
    });
  } else if (document.activeElement && dom.playerFrame.contains(document.activeElement)) {
    window.requestAnimationFrame(() => {
      dom.playerFrame.dataset.suppressOverlayFocus = "1";
      window.setTimeout(() => {
        if (dom.playerFrame?.dataset.suppressOverlayFocus === "1") {
          delete dom.playerFrame.dataset.suppressOverlayFocus;
        }
      }, 400);
      dom.videoPlayer?.focus({ preventScroll: true });
    });
  }
  refreshTooltipForTarget(dom.playerChatToggleButton);
  syncUnreadBadgesWithVisibility();
  if (visible && source !== "auto") {
    window.setTimeout(() => {
      if (dom.playerFrame.classList.contains("chat-inside-open")) {
        resetInsideUnread();
      }
    }, 220);
  }
  scheduleMessageTimeAdjustmentAfterLayout();
  if (visible && source === "auto") scheduleAutoCollapse(true);
  logEvent("ui", visible ? "Chat interno visible." : "Chat interno oculto.");
}

export function syncInsideChatPanelOffset() {
  if (!dom.playerFrame) return;

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (!isFullscreen || !dom.playerActions) {
    dom.playerFrame.style.removeProperty("--inside-chat-top-offset");
    return;
  }

  const frameRect = dom.playerFrame.getBoundingClientRect();
  const actionsRect = dom.playerActions.getBoundingClientRect();
  const offset = Math.max(48, Math.round(actionsRect.bottom - frameRect.top + 10));
  dom.playerFrame.style.setProperty("--inside-chat-top-offset", `${offset}px`);
}

export function syncExternalChatCollapseHandleOffset() {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) return;
  if (dom.sessionView.classList.contains("chat-layout-transitioning")) return;

  if (dom.sessionView.dataset.chatDock === "bottom") {
    dom.sessionView.classList.remove("chat-collapse-in-header");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-top");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-left");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-size");
  }

  if ((dom.sessionView.dataset.chatDock || "right") !== "bottom") {
    const isRightDock = dom.sessionView.dataset.chatDock === "right";
    const isExpanded = !dom.sessionView.classList.contains("chat-collapsed");
    const chatHeader = dom.chatArea.querySelector(".chat-tools");
    const chatRect = dom.chatArea.getBoundingClientRect();
    const isHeaderAnchoredLayout = Boolean(
      isRightDock
        && isExpanded
        && shouldAnchorChatCollapseHandleInHeader({
          workspace: dom.workspace,
          chatArea: dom.chatArea,
          chatHeader,
          isStacked: isStackedSessionLayout(),
        }),
    );
    dom.sessionView.classList.toggle("chat-collapse-in-header", isHeaderAnchoredLayout);
    if (isHeaderAnchoredLayout) {
      const headerRect = chatHeader.getBoundingClientRect();
      const chatStyles = getComputedStyle(dom.chatArea);
      const headerStyles = getComputedStyle(chatHeader);
      const chatBorderTop = Number.parseFloat(chatStyles.borderTopWidth) || 0;
      const chatBorderLeft = Number.parseFloat(chatStyles.borderLeftWidth) || 0;
      const firstLeadingControl = chatHeader.querySelector(".chat-tools-leading > *");
      const firstHeaderControlRect = firstLeadingControl?.getBoundingClientRect();
      const iconAnchor = dom.collapseChatButton?.querySelector(".chat-collapse-icon-anchor");
      const iconAnchorRect = iconAnchor?.getBoundingClientRect();
      const iconAnchorSize =
        iconAnchorRect?.width
        || Number.parseFloat(iconAnchor ? getComputedStyle(iconAnchor).width : "")
        || 28;
      const headerInlineStartPadding = Number.parseFloat(headerStyles.paddingInlineStart) || 0;
      const leadingSpace = firstHeaderControlRect?.width > 0
        ? Math.max(0, firstHeaderControlRect.left - headerRect.left)
        : headerInlineStartPadding || iconAnchorSize;
      const handleLeft =
        headerRect.left - chatRect.left - chatBorderLeft
        + Math.max(0, (leadingSpace - iconAnchorSize) / 2);
      const handleTop = Math.max(
        0,
        headerRect.top - chatRect.top - chatBorderTop + headerRect.height / 2,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-left",
        `${handleLeft}px`,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-size",
        `${iconAnchorSize}px`,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-top",
        `${handleTop}px`,
      );
    } else {
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-top");
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-left");
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-size");
    }

    const isMobileRightDock =
      isRightDock
      && isStackedSessionLayout();
    const isPortraitMobileRightDock =
      isMobileRightDock
      && window.matchMedia("(orientation: portrait)").matches;
    if (isMobileRightDock && dom.videoArea) {
      const workspaceRect = dom.workspace.getBoundingClientRect();
      const videoRect = dom.videoArea.getBoundingClientRect();
      const playerControlBarRect = dom.playerFrame
        ?.querySelector(".player-controls-bar")
        ?.getBoundingClientRect();
      const videoCenterTop =
        videoRect.top - workspaceRect.top + videoRect.height / 2;
      dom.sessionView.style.setProperty(
        "--chat-right-mobile-handle-top",
        `${Math.round(isPortraitMobileRightDock ? videoRect.bottom - workspaceRect.top : videoCenterTop)}px`,
      );
      if (isPortraitMobileRightDock && playerControlBarRect?.height) {
        dom.sessionView.style.setProperty(
          "--chat-right-mobile-collapsed-handle-top",
          `${Math.round(playerControlBarRect.top - workspaceRect.top)}px`,
        );
      } else {
        dom.sessionView.style.setProperty(
          "--chat-right-mobile-collapsed-handle-top",
          `${Math.round(videoCenterTop)}px`,
        );
      }
    } else {
      dom.sessionView.style.removeProperty("--chat-right-mobile-handle-top");
      dom.sessionView.style.removeProperty("--chat-right-mobile-collapsed-handle-top");
    }
    dom.sessionView.style.removeProperty("--chat-bottom-dock-handle-top");
    dom.sessionView.style.removeProperty("--chat-bottom-dock-collapsed-handle-top");
    return;
  }

  const workspaceRect = dom.workspace.getBoundingClientRect();
  const chatRect = dom.chatArea.getBoundingClientRect();
  const chatHeader = dom.chatArea.querySelector(".chat-tools");
  const chatHeaderRect = chatHeader?.getBoundingClientRect();
  const isPortraitMobileBottomDock =
    window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches;
  const isLandscapeMobileFullscreenBottomDock =
    isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
  const parsedDockGap = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--chat-bottom-dock-gap"),
  );
  const dockGap = Number.isFinite(parsedDockGap) ? parsedDockGap : 24;
  const playerControlBar = dom.playerFrame?.querySelector(".player-controls-bar");
  const playerControlBarRect = playerControlBar?.getBoundingClientRect();
  const parsedArrowOffset = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--chat-bottom-header-arrow-offset"),
  );
  const arrowOffset = Number.isFinite(parsedArrowOffset) ? parsedArrowOffset : 16;
  const collapseHandleHeight = dom.collapseChatButton?.getBoundingClientRect().height || 32;
  const isFullscreenBottomChatBelowViewport =
    isLandscapeMobileFullscreenBottomDock
    && chatRect.top >= window.innerHeight - 1;
  // La zona de la flecha vive dentro de .chat-area, por lo que su offset
  // vertical debe ser relativo al panel y no al workspace completo. Usar el
  // workspace aquí la deja fuera del header en el dock inferior de escritorio.
  const chatHeaderStyles = chatHeader ? getComputedStyle(chatHeader) : null;
  const headerPaddingTop = Number.parseFloat(chatHeaderStyles?.paddingTop || "0") || 0;
  const headerPaddingBottom = Number.parseFloat(chatHeaderStyles?.paddingBottom || "0") || 0;
  // Con padding vertical asimétrico, el centro geométrico del header no
  // coincide con el centro visual de su contenido. La corrección se deriva
  // de esos paddings para no fijar un desplazamiento en píxeles.
  const headerContentCenterCorrection = (headerPaddingTop - headerPaddingBottom) / 2;
  const handleTop = isFullscreenBottomChatBelowViewport
    ? playerControlBarRect
      ? Math.max(0, Math.round(playerControlBarRect.top - workspaceRect.top - 36))
      : Math.max(0, Math.round(chatRect.top - workspaceRect.top - collapseHandleHeight / 2))
    : chatHeaderRect && !isPortraitMobileBottomDock
      ? Math.max(
        0,
        Math.round(
          chatHeaderRect.top
          - chatRect.top
          + chatHeaderRect.height / 2
          - headerContentCenterCorrection,
        ),
      )
      : Math.max(
        0,
        Math.round(
          chatRect.top
          - workspaceRect.top
          + (isPortraitMobileBottomDock ? 0 : arrowOffset - dockGap / 2),
        ),
      );
  dom.sessionView.style.setProperty("--chat-bottom-dock-handle-top", `${handleTop}px`);
  const collapsedHandleTop = playerControlBarRect
    ? isPortraitMobileBottomDock
      ? Math.max(
        0,
        Math.round(
          playerControlBarRect.top
          - workspaceRect.top
          - 20,
        ),
      )
      : Math.max(0, Math.round(playerControlBarRect.top - workspaceRect.top - 36))
    : handleTop;
  dom.sessionView.style.setProperty(
    "--chat-bottom-dock-collapsed-handle-top",
    `${collapsedHandleTop}px`,
  );
}

function scheduleExternalChatCollapseHandleOffset() {
  syncExternalChatCollapseHandleOffset();
  window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);
  if (collapseHandleOffsetTimer) {
    window.clearTimeout(collapseHandleOffsetTimer);
  }
  collapseHandleOffsetTimer = window.setTimeout(() => {
    collapseHandleOffsetTimer = 0;
    syncExternalChatCollapseHandleOffset();
  }, CHAT_LAYOUT_SETTLE_MS);
}

function lockChatScrollSnapDuringProgrammaticScroll(durationMs = CHAT_SCROLL_SNAP_LOCK_MS) {
  if (!dom.sessionView) return;

  dom.sessionView.classList.add("chat-scroll-snap-locked");
  if (chatScrollSnapLockTimer) {
    window.clearTimeout(chatScrollSnapLockTimer);
  }
  chatScrollSnapLockTimer = window.setTimeout(() => {
    chatScrollSnapLockTimer = 0;
    dom.sessionView.classList.remove("chat-scroll-snap-locked");
  }, durationMs);
}

export function getPersistedInsideChatStyle() {
  const savedStyle = localStorage.getItem(CHAT_STYLE_KEY);
  return ["float", "panel"].includes(savedStyle) ? savedStyle : "float";
}

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
  localStorage.setItem(CHAT_STYLE_KEY, nextStyle);
  scheduleMessageTimeAdjustmentAfterLayout();
  logEvent("ui", `Estilo de chat interno: ${nextStyle}.`);
}

function dispatchChatDockTransition(currentDock, nextDock, options, videoScrollTop) {
  const transition = resolveChatDockTransition({
    currentDock,
    nextDock,
    skipTransition: options.skipTransition,
    isCollapsed: dom.sessionView?.classList.contains("chat-collapsed") || false,
    isFullscreen: isFullscreenPageActive(),
    isStacked: isStackedSessionLayout(),
    isCoarsePointer: window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    isMobilePortrait: isMobilePortraitChatViewport(),
  });

  switch (transition) {
    case CHAT_DOCK_TRANSITIONS.FULLSCREEN_BOTTOM_TO_RIGHT:
      animateFullscreenBottomToRightWithNativeCollapse();
      return true;
    case CHAT_DOCK_TRANSITIONS.BOTTOM_TO_RIGHT:
      scheduleBottomToRightSwitch(nextDock, videoScrollTop);
      return true;
    case CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_NATIVE:
      animateRightToBottomWithNativeCollapse();
      return true;
    case CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_MOBILE:
      animateRightToBottomSwitch(nextDock);
      return true;
    case CHAT_DOCK_TRANSITIONS.RIGHT_TO_BOTTOM_STACKED:
      // En esta composición los paneles ya se apilan. Cambiar directamente
      // evita el amague lateral; setChatDock lleva el viewport a la unión
      // entre video y chat para que el panel nuevo quede a la vista.
      setChatDock(nextDock, { skipTransition: true });
      return true;
    case CHAT_DOCK_TRANSITIONS.FULLSCREEN:
      animateFullscreenDockSwitch(nextDock);
      return true;
    default:
      return false;
  }
}

export function setChatDock(dock, options = {}) {
  const nextDock = CHAT_DOCKS.includes(dock) ? dock : "right";
  const currentDock = dom.sessionView?.dataset.chatDock || "right";
  const centeredVideoScrollTop = getBottomToRightScrollTop();

  if (!options.skipTransition && pendingChatDockSwitch) return;
  if (dispatchChatDockTransition(currentDock, nextDock, options, centeredVideoScrollTop)) return;

  // El paso al dock inferior no interpola la grilla, pero sí mueve el
  // viewport. Congelar las mediciones auxiliares evita lecturas de layout
  // mientras el navegador realiza ese desplazamiento suave.
  if (!options.skipTransition) {
    setCollapseHandleTransitioning(true);
  }

  const meta = CHAT_DOCK_META[nextDock];
  const icon = dom.dockChatButton.querySelector("[data-lucide]");

  cancelIdentityEditing();
  dom.sessionView.dataset.chatDock = nextDock;
  dom.sessionView.classList.remove("chat-header-collapsed");
  if (nextDock === "bottom") {
    // setCollapseHandleTransitioning fija temporalmente el ancho lateral del
    // formulario para que no salte durante ese dock. Ese ancho no puede
    // sobrevivir al cambio a la superficie inferior.
    dom.chatArea?.querySelector(".message-form")?.style.removeProperty("width");
  }
  dom.dockChatButton.dataset.tooltip = meta.tooltip;
  dom.dockChatButton.removeAttribute("title");
  dom.dockChatButton.setAttribute("aria-label", `Chat ${meta.label}. ${meta.tooltip}`);
  if (icon) {
    const nextMeta = CHAT_DOCK_META[meta.next];
    icon.setAttribute("data-lucide", nextMeta.icon);
    icon.innerHTML = "";
  }
  localStorage.setItem("cine-juntos-chat-dock", nextDock);
  hydrateIcons();
  updateCollapseButton();
  // La presencia se inicializa antes de establecer el dock; sincronizar aquí
  // garantiza que la geometría use la flecha inferior ya montada, sin moverla.
  syncNameInputWidth();
  window.requestAnimationFrame(() => {
    if (dom.sessionView?.dataset.chatDock === nextDock) syncNameInputWidth();
  });
  syncUnreadBadgesWithVisibility();
  scheduleExternalChatCollapseHandleOffset();

  // Al hidratar la sala no debemos corregir el scroll que ya eligió el
  // navegador o el usuario. La revelación suave solo corresponde al cambio
  // manual hacia el dock inferior.
  if (
    nextDock === "bottom"
    && !options.preserveScroll
    && !dom.sessionView.classList.contains("chat-collapsed")
  ) {
    lockChatScrollSnapDuringProgrammaticScroll();
    window.requestAnimationFrame(() => revealBottomDockUnion());
  }

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen && !options.skipFullscreenFocus) {
    focusFullscreenWorkspace();
  }
}

function animateFullscreenDockSwitch(nextDock) {
  if (!dom.sessionView || !dom.chatArea) {
    setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
    return;
  }

  const transition = {
    nextDock,
    outTimerId: 0,
    inTimerId: 0,
  };
  pendingChatDockSwitch = transition;
  keepChatDockHandlesHidden();
  setCollapseHandleTransitioning(
    true,
    FULLSCREEN_DOCK_OUT_MS + FULLSCREEN_DOCK_IN_MS + 80,
  );

  const sessionView = dom.sessionView;
  const chatArea = dom.chatArea;
  sessionView.classList.add("chat-dock-mobile-transition-out");
  // Primero se fija el estado inicial y recién en el frame siguiente se
  // dispara la salida. Así la transición no se convierte en un salto al
  // aplicar la clase y el cambio de dock queda después de que termina.
  void chatArea.offsetWidth;
  window.requestAnimationFrame(() => {
    if (pendingChatDockSwitch !== transition) return;
    sessionView.classList.add("chat-dock-mobile-transition-out-active");
    transition.outTimerId = window.setTimeout(() => {
      if (pendingChatDockSwitch !== transition) return;

      sessionView.classList.remove(
        "chat-dock-mobile-transition-out",
        "chat-dock-mobile-transition-out-active",
      );
      setChatDock(nextDock, {
        skipTransition: true,
        preserveScroll: true,
        skipFullscreenFocus: true,
      });
      // En PC el dock inferior tiene una cortina propia que también se usa
      // fuera de fullscreen. Reutilizarla acá mantiene el mismo despliegue y
      // hace que el scroll acompañe al panel hasta la unión inferior.
      if (nextDock === "bottom" && isDesktopBottomDock()) {
        pendingChatDockSwitch = null;
        animateDesktopBottomChatExpand();
        scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
        return;
      }
      if (nextDock === "bottom") {
        revealBottomDockUnion("auto");
      } else {
        focusFullscreenWorkspace();
      }
      sessionView.classList.add("chat-dock-mobile-transition-in");
      void chatArea.offsetWidth;
      window.requestAnimationFrame(() => {
        if (pendingChatDockSwitch !== transition) return;
        sessionView.classList.add("chat-dock-mobile-transition-in-active");
        transition.inTimerId = window.setTimeout(() => {
          if (pendingChatDockSwitch !== transition) return;
          pendingChatDockSwitch = null;
          scheduleChatDockHandlesReveal(FULLSCREEN_DOCK_IN_MS + 80);
          sessionView.classList.remove(
            "chat-dock-mobile-transition-in",
            "chat-dock-mobile-transition-in-active",
          );
          setCollapseHandleTransitioning(false);
          scheduleExternalChatCollapseHandleOffset();
          scheduleMessageTimeAdjustmentAfterLayout();
    }, FULLSCREEN_DOCK_IN_MS);
      });
    }, FULLSCREEN_DOCK_OUT_MS);
  });
}

function animateRightToBottomWithNativeCollapse() {
  const transition = {
    switchTimerId: 0,
  };
  pendingChatDockSwitch = transition;
  keepChatDockHandlesHidden();

  // Es el mismo cambio que ejecuta el botón "Contraer chat". Al terminar la
  // reducción lateral se monta el dock inferior todavía contraído y se deja
  // que setExternalChatCollapsed(false) ejecute su expansión natural.
  setExternalChatCollapsed(true, { source: "dock-switch" });
  transition.switchTimerId = window.setTimeout(() => {
    if (pendingChatDockSwitch !== transition) return;
    pendingChatDockSwitch = null;
    setChatDock("bottom", {
      skipTransition: true,
      preserveScroll: true,
      skipFullscreenFocus: true,
    });
    // Medir la geometría inferior mientras sigue contraído; al abrirlo después,
    // el primer frame ya reserva una fila completa para el reproductor y otra
    // para el chat.
    syncComponentAspectLayoutNow({ allowDuringChatTransition: true });
    setExternalChatCollapsed(false, { source: "dock-switch" });
    scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
  }, RIGHT_CHAT_LAYOUT_TRANSITION_MS + 40);
}

function animateFullscreenBottomToRightWithNativeCollapse() {
  const transition = {
    switchTimerId: 0,
  };
  pendingChatDockSwitch = transition;
  keepChatDockHandlesHidden();

  // Primero se ejecuta la cortina natural del dock inferior. El dock lateral
  // se monta recién cuando el video ya recuperó su posición y luego se abre
  // con la transición natural de expansión del panel.
  setExternalChatCollapsed(true, { source: "dock-switch" });
  transition.switchTimerId = window.setTimeout(() => {
    if (pendingChatDockSwitch !== transition) return;
    pendingChatDockSwitch = null;
    setChatDock("right", {
      skipTransition: true,
      preserveScroll: true,
      skipFullscreenFocus: true,
    });
    setExternalChatCollapsed(false, { source: "dock-switch" });
    scheduleChatDockHandlesReveal(RIGHT_CHAT_LAYOUT_TRANSITION_MS + 80);
  }, BOTTOM_CHAT_CURTAIN_MS + 40);
}

function getBottomToRightScrollTop() {
  if (!dom.videoArea) return 0;

  if (
    dom.workspace
    && window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches
  ) {
    return Math.min(
      getPageScrollMax(),
      Math.max(0, Math.round(getElementPageTop(dom.workspace))),
    );
  }

  const videoRect = dom.videoArea.getBoundingClientRect();
  const maxScrollTop = getPageScrollMax();
  const viewportHeight = isFullscreenPageActive()
    ? (getPageScrollContainer().clientHeight || window.innerHeight)
    : document.documentElement.clientHeight;
  const centeredVideoTop =
    getElementPageTop(dom.videoArea) + videoRect.height / 2 - viewportHeight / 2;

  return Math.min(maxScrollTop, Math.max(0, Math.round(centeredVideoTop)));
}

function animateRightToBottomSwitch(nextDock) {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) {
    setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
    return;
  }

  const transition = {
    collapsed: false,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    // En el dock lateral el video ocupa todo el viewport y el chat está
    // superpuesto. Convertimos ese estado visual en las filas iniciales de la
    // cortina inferior antes de empezar a revelar el panel.
    startRows: [Math.max(0, dom.workspace.clientHeight), 0],
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop: 0,
  };
  bottomChatTransition = transition;
  keepChatDockHandlesHidden();
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );

  // Cambiar el dock sin revelar el chat todavía permite que el mismo motor de
  // la cortina inferior controle las filas y el recorte, sin un frame visible
  // en el que aparezcan ambos chats.
  setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
  dom.sessionView.classList.add("chat-bottom-mobile-expand-visual");
  transition.targetRows = getWorkspaceRowHeights();
  transition.targetScrollTop = getBottomDockChatScrollTop();
  dom.workspace.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add("chat-bottom-mobile-curtain-active");
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
    scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function scheduleBottomToRightSwitch(nextDock, targetScrollTop) {
  if (pendingBottomToRightSwitch) return;

  const transition = {
    frameId: 0,
    timeoutId: 0,
  };
  pendingBottomToRightSwitch = transition;
  keepChatDockHandlesHidden();

  const needsScroll = Math.abs(getPageScrollTop() - targetScrollTop) > 2;
  if (needsScroll) {
    lockChatScrollSnapDuringProgrammaticScroll();
    scrollPageTo(targetScrollTop, "smooth");
  }

  const finish = () => {
    if (pendingBottomToRightSwitch !== transition) return;
    pendingBottomToRightSwitch = null;
    window.cancelAnimationFrame(transition.frameId);
    window.clearTimeout(transition.timeoutId);

    const useViewportOverlaySwitch = nextDock === "right"
      && window.matchMedia("(max-width: 680px)").matches;
    const switchDuration = useViewportOverlaySwitch
      ? RIGHT_CHAT_LAYOUT_TRANSITION_MS
      : BOTTOM_TO_RIGHT_LAYOUT_MS;

    // Separar el cambio de clase del cambio de dock permite que la grilla
    // tenga un estado inicial estable antes de extender el panel lateral.
    // Este es el único cambio de grilla animado entre docks. Durante él no
    // se deben recalcular offsets ni reservas del compositor por cada frame.
    setCollapseHandleTransitioning(true, switchDuration);
    dom.sessionView.classList.add("chat-dock-switching");
    window.requestAnimationFrame(() => {
      setChatDock(nextDock, {
        skipTransition: true,
        preserveScroll: true,
        skipFullscreenFocus: isFullscreenPageActive(),
      });
      const chatArea = dom.chatArea;
      const workspace = dom.workspace;
      const fullscreenSwitch = isFullscreenPageActive();
      // En una ventana angosta la superficie se monta sobre el video. Mantener
      // el ancho final y revelar con clip-path evita que el composer se
      // reacomode durante cada frame de la transición.
      if (useViewportOverlaySwitch) {
        chatArea?.style.setProperty("flex-basis", "100%");
        chatArea?.style.setProperty("width", "100%");
        chatArea?.style.setProperty("clip-path", "inset(0 0 0 100%)");
      } else {
        // En el dock lateral de escritorio el ancho sí se anima junto al video.
        chatArea?.style.setProperty("flex-basis", "0px");
        chatArea?.style.setProperty("width", "0px");
      }
      chatArea?.style.setProperty("min-width", "0px");
      chatArea?.style.setProperty("opacity", useViewportOverlaySwitch ? "1" : "0");
      chatArea?.style.setProperty("transition", "none");
      if (fullscreenSwitch) {
        workspace?.style.setProperty("grid-template-columns", "minmax(0, 1fr) 0px");
        workspace?.style.setProperty("transition", "none");
      }
      // Confirmar el estado lateral colapsado antes de habilitar la entrada.
      // Sin esta lectura el navegador puede agrupar ambos estados y saltar
      // directamente de dock inferior a 320px.
      void chatArea?.offsetWidth;
      void workspace?.offsetWidth;
      window.requestAnimationFrame(() => {
        if (
          nextDock === "right"
          && window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches
        ) {
          const workspaceTop = Math.min(
            getPageScrollMax(),
            Math.max(0, Math.round(getElementPageTop(dom.workspace))),
          );
          scrollPageTo(workspaceTop, "auto");
        }
        dom.sessionView.classList.add("chat-dock-switching-entered");
        if (useViewportOverlaySwitch) {
          chatArea?.style.setProperty(
            "transition",
            `clip-path ${switchDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          );
          chatArea?.style.setProperty("clip-path", "inset(0 0 0 0)");
          chatArea?.style.setProperty("opacity", "1");
        } else {
          chatArea?.style.setProperty(
            "transition",
            `flex-basis ${BOTTOM_TO_RIGHT_LAYOUT_MS}ms ease-in-out, width ${BOTTOM_TO_RIGHT_LAYOUT_MS}ms ease-in-out, opacity ${BOTTOM_TO_RIGHT_LAYOUT_MS}ms ease-in-out`,
          );
          chatArea?.style.setProperty("flex-basis", "var(--chat-panel-width)");
          chatArea?.style.setProperty("width", "var(--chat-panel-width)");
          chatArea?.style.setProperty("opacity", "1");
        }
        if (fullscreenSwitch) {
          workspace?.style.setProperty(
            "transition",
            `grid-template-columns ${BOTTOM_TO_RIGHT_LAYOUT_MS}ms ease-in-out`,
          );
          workspace?.style.setProperty(
            "grid-template-columns",
            "minmax(0, 1fr) var(--chat-panel-width)",
          );
        }
        scheduleChatDockHandlesReveal(switchDuration + 80);
        window.setTimeout(() => {
          dom.sessionView.classList.remove("chat-dock-switching", "chat-dock-switching-entered");
          chatArea?.style.removeProperty("flex-basis");
          chatArea?.style.removeProperty("width");
          chatArea?.style.removeProperty("min-width");
          chatArea?.style.removeProperty("opacity");
          chatArea?.style.removeProperty("transition");
          chatArea?.style.removeProperty("clip-path");
          workspace?.style.removeProperty("grid-template-columns");
          workspace?.style.removeProperty("transition");
        }, switchDuration);
      });
    });
  };

  if (!needsScroll) {
    transition.frameId = window.requestAnimationFrame(finish);
    return;
  }

  const startedAt = performance.now();
  const waitForScroll = () => {
    if (
      Math.abs(getPageScrollTop() - targetScrollTop) <= 2
      || performance.now() - startedAt >= BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS
    ) {
      finish();
      return;
    }
    transition.frameId = window.requestAnimationFrame(waitForScroll);
  };

  transition.frameId = window.requestAnimationFrame(waitForScroll);
  transition.timeoutId = window.setTimeout(finish, BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS + 80);
}

function clearBottomChatTransitionVisuals() {
  dom.sessionView?.classList.remove(
    "chat-bottom-collapse-visual",
    "chat-bottom-expand-visual",
    "chat-bottom-mobile-collapse-visual",
    "chat-bottom-mobile-expand-visual",
    "chat-bottom-mobile-curtain-active",
    "chat-bottom-pc-collapse-visual",
    "chat-bottom-pc-expand-visual",
    "chat-bottom-curtain-active",
  );
  dom.sessionView?.style.removeProperty("--chat-bottom-curtain-clip");
  dom.workspace?.style.removeProperty("grid-template-rows");
  dom.chatArea?.style.removeProperty("clip-path");
  dom.chatArea?.style.removeProperty("opacity");
  const messageForm = dom.chatArea?.querySelector(".message-form");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-left");
  messageForm?.style.removeProperty("--chat-bottom-pc-expand-composer-width");
  if (dom.sessionView?.dataset.chatDock === "bottom") {
    messageForm?.style.removeProperty("width");
  }
}

function lockBottomChatScrollAnchoring(transition) {
  const scrollContainer = isFullscreenPageActive()
    ? getPageScrollContainer()
    : document.scrollingElement || document.documentElement;
  if (!scrollContainer?.style) return;

  transition.scrollAnchorContainer = scrollContainer;
  transition.previousScrollAnchor = scrollContainer.style.getPropertyValue("overflow-anchor");
  transition.previousScrollAnchorPriority = scrollContainer.style.getPropertyPriority("overflow-anchor");
  scrollContainer.style.setProperty("overflow-anchor", "none");
}

function restoreBottomChatScrollAnchoring(transition) {
  const scrollContainer = transition?.scrollAnchorContainer;
  if (!scrollContainer?.style) return;

  if (transition.previousScrollAnchor) {
    scrollContainer.style.setProperty(
      "overflow-anchor",
      transition.previousScrollAnchor,
      transition.previousScrollAnchorPriority,
    );
  } else {
    scrollContainer.style.removeProperty("overflow-anchor");
  }
  transition.scrollAnchorContainer = null;
}

function cancelBottomChatTransition() {
  if (bottomChatTransition) {
    window.cancelAnimationFrame(bottomChatTransition.frameId);
    window.clearTimeout(bottomChatTransition.timeoutId);
    restoreBottomChatScrollAnchoring(bottomChatTransition);
    bottomChatTransition = null;
  }
  clearBottomChatTransitionVisuals();
}

function isDesktopBottomDock() {
  const isLandscapeMobile = isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
  return dom.sessionView?.dataset.chatDock === "bottom"
    && (!isStackedSessionLayout() || isLandscapeMobile);
}

function completeDesktopBottomChatTransition(transition) {
  if (bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  bottomChatTransition = null;
  setCollapseHandleTransitioning(false);
  scheduleExternalChatCollapseHandleOffset();
  clearBottomChatTransitionVisuals();
}

function easeBottomChatCurtainProgress(progress) {
  // Curva de salida equivalente a la que usa la cortina lateral:
  // arranca decidida y desacelera al llegar al borde final.
  return 1 - ((1 - progress) ** 3);
}

function setDesktopBottomChatCurtainProgress(progress) {
  const clip = Math.max(0, Math.min(100, progress));
  dom.sessionView?.style.setProperty("--chat-bottom-curtain-clip", `${clip}%`);
}

function getWorkspaceRowHeights() {
  if (!dom.workspace) return [0, 0];

  const rows = getComputedStyle(dom.workspace)
    .gridTemplateRows
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value));
  return [
    Number.isFinite(rows[0]) ? rows[0] : 0,
    Number.isFinite(rows[1]) ? rows[1] : 0,
  ];
}

function getWorkspaceContentHeight() {
  if (!dom.workspace) return 0;

  const styles = getComputedStyle(dom.workspace);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, dom.workspace.clientHeight - paddingTop - paddingBottom);
}

function setMobileBottomTransitionProgress(transition, progress) {
  const easedProgress = easeBottomChatCurtainProgress(progress);
  const videoHeight = transition.startRows[0]
    + ((transition.targetRows[0] - transition.startRows[0]) * easedProgress);
  const chatHeight = transition.startRows[1]
    + ((transition.targetRows[1] - transition.startRows[1]) * easedProgress);
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${Math.max(0, videoHeight)}px ${Math.max(0, chatHeight)}px`,
  );

  const clipProgress = transition.collapsed ? easedProgress : 1 - easedProgress;
  dom.chatArea?.style.setProperty(
    "clip-path",
    `inset(0 0 ${Math.max(0, Math.min(100, clipProgress * 100))}% 0)`,
  );

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * easedProgress);
  scrollPageTo(Math.round(scrollProgress), "auto");
}

function completeMobileBottomChatTransition(transition) {
  if (bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  bottomChatTransition = null;
  setCollapseHandleTransitioning(false);
  scheduleExternalChatCollapseHandleOffset();
  clearBottomChatTransitionVisuals();
}

function stepMobileBottomChatTransition(transition, force = false) {
  if (bottomChatTransition !== transition) return;

  const linearProgress = force
    ? 1
    : Math.min(1, Math.max(0, (performance.now() - transition.startedAt) / BOTTOM_CHAT_CURTAIN_MS));
  setMobileBottomTransitionProgress(transition, linearProgress);

  if (linearProgress < 1) {
    transition.frameId = window.requestAnimationFrame(() => {
      stepMobileBottomChatTransition(transition);
    });
    return;
  }

  completeMobileBottomChatTransition(transition);
}

function stepDesktopBottomChatTransition(transition, force = false) {
  if (bottomChatTransition !== transition) return;

  const elapsed = performance.now() - transition.startedAt;
  const linearProgress = force
    ? 1
    : Math.min(1, Math.max(0, elapsed / BOTTOM_CHAT_CURTAIN_MS));
  const progress = easeBottomChatCurtainProgress(linearProgress);
  // En escritorio la unión visual está en el borde superior del panel. Al
  // cerrar se oculta desde arriba hacia abajo; al abrir se revela desde abajo
  // hacia arriba, mientras el shell desplaza el video en el mismo frame.
  const clipProgress = transition.collapsed ? progress : 1 - progress;
  setDesktopBottomChatCurtainProgress(clipProgress * 100);

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * progress);
  scrollPageTo(Math.round(scrollProgress), "auto");

  if (linearProgress < 1) {
    transition.frameId = window.requestAnimationFrame(() => {
      stepDesktopBottomChatTransition(transition);
    });
    return;
  }

  if (transition.collapsed) {
    // El último frame ya dejó el panel cerrado y el scroll en el destino; al
    // reducir ahora la fila no se produce un salto ni se pierde la cortina.
    applyExternalChatCollapsed(true);
    setCollapseHandleTransitioning(
      true,
      BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
    );
    scrollPageTo(transition.targetScrollTop, "auto");
  }
  completeDesktopBottomChatTransition(transition);
}

function animateDesktopBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    applyExternalChatCollapsed(true);
    return;
  }

  const transition = {
    collapsed: true,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add("chat-bottom-pc-collapse-visual");
  setDesktopBottomChatCurtainProgress(0);
  void dom.chatArea.offsetWidth;
  transition.frameId = window.requestAnimationFrame(() => {
    if (bottomChatTransition !== transition) return;
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function animateDesktopBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    applyExternalChatCollapsed(false);
    return;
  }

  const transition = {
    collapsed: false,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    // Guardar el anclaje antes de abrir la segunda fila. De lo contrario el
    // scroll anchoring del navegador desplaza la página durante el reflow y la
    // animación empieza desde una posición intermedia, mostrando dos etapas.
    startScrollTop: getPageScrollTop(),
    targetScrollTop: 0,
  };
  bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  setDesktopBottomChatCurtainProgress(100);
  // Se reserva la fila completa con la cortina cerrada. Desde el primer frame
  // el scroll y la apertura recorren juntos la distancia hasta la unión.
  applyExternalChatCollapsed(false);
  const messageForm = dom.chatArea.querySelector(".message-form");
  const composerBounds = messageForm?.getBoundingClientRect();
  const chatAreaBounds = dom.chatArea.getBoundingClientRect();
  if (messageForm && composerBounds?.width > 0) {
    // Ajustar la coordenada una vez aplicado fixed: el containing block puede
    // ser un ancestro interno, así que un left porcentual no equivale al viewport.
    messageForm.style.setProperty("--chat-bottom-pc-expand-composer-left", "0px");
    messageForm.style.setProperty(
      "--chat-bottom-pc-expand-composer-width",
      `${composerBounds.width}px`,
    );
  }
  dom.sessionView.classList.add("chat-bottom-pc-expand-visual");
  if (messageForm && composerBounds?.width > 0) {
    const fixedBounds = messageForm.getBoundingClientRect();
    const targetLeft =
      chatAreaBounds.left + (chatAreaBounds.width - fixedBounds.width) / 2;
    messageForm.style.setProperty(
      "--chat-bottom-pc-expand-composer-left",
      `${targetLeft - fixedBounds.left}px`,
    );
  }
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  transition.targetScrollTop = getBottomDockChatScrollTop();
  // Eliminar el ajuste automático de scroll que produjo el reflow antes del
  // primer repintado, para que la cortina y el scroll recorran una sola fase.
  scrollPageTo(transition.startScrollTop, "auto");
  void dom.chatArea.offsetWidth;
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function animateBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    applyExternalChatCollapsed(true);
    return;
  }

  const transition = {
    collapsed: true,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add("chat-bottom-mobile-collapse-visual");
  void dom.workspace?.offsetWidth;
  applyExternalChatCollapsed(true);
  transition.targetRows = [
    getWorkspaceContentHeight(),
    0,
  ];
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  // El viewport acompaña la cortina desde el primer frame: al terminar el
  // reproductor queda alineado en la posición superior de la página.
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add("chat-bottom-mobile-curtain-active");
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function animateBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    applyExternalChatCollapsed(false);
    return;
  }

  const transition = {
    collapsed: false,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows: getWorkspaceRowHeights(),
    targetRows: [0, 0],
    startScrollTop: getPageScrollTop(),
    // El layout contraído ya tiene la altura final estable del documento.
    // Calcular el destino después de abrir la grilla incluye el overflow
    // temporal de la cortina y luego provoca un clamp visible al limpiarla.
    targetScrollTop: getBottomDockChatScrollTop(),
  };
  bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  dom.sessionView.classList.add("chat-bottom-mobile-expand-visual");
  void dom.workspace?.offsetWidth;
  // Primero se reserva la fila completa con el contenido todavía oculto;
  // después se revela desde la unión superior hacia abajo.
  applyExternalChatCollapsed(false);
  transition.targetRows = getWorkspaceRowHeights();
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.workspace?.style.setProperty(
    "grid-template-rows",
    `${transition.startRows[0]}px ${transition.startRows[1]}px`,
  );
  setMobileBottomTransitionProgress(transition, 0);
  void dom.chatArea.offsetWidth;
  dom.sessionView.classList.add("chat-bottom-mobile-curtain-active");
  transition.startedAt = performance.now();
  transition.frameId = window.requestAnimationFrame(() => {
    stepMobileBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepMobileBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

function getBottomDockVideoScrollTop() {
  if (!dom.sessionView || !dom.videoArea) return 0;

  const gutter = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--app-shell-gutter"),
  ) || 0;
  // En móvil la sesión ocupa todo el ancho y el video debe comenzar en el
  // borde superior del viewport. El gutter ya no forma parte del espacio
  // visible, por lo que restarlo deja el reproductor desplazado al contraer.
  const mobileViewport = window.matchMedia("(max-width: 680px)").matches
    || (isStackedSessionLayout() && window.matchMedia("(orientation: landscape)").matches);
  const topOffset = isFullscreenPageActive() || mobileViewport ? 0 : gutter;
  return Math.max(0, Math.round(getElementPageTop(dom.videoArea) - topOffset));
}

export function setExternalChatCollapsed(collapsed, options = {}) {
  const source = options.source || "user";
  const preserveRightDockScroll = collapsed && isMobileLandscapeRightDock();
  const preservedPageScrollTop = preserveRightDockScroll
    ? pendingRightDockCollapseScrollTop ?? getPageScrollTop()
    : null;
  pendingRightDockCollapseScrollTop = null;
  if (!collapsed) {
    state.chat.autoOpenedExternal = source === "auto";
  } else {
    state.chat.autoOpenedExternal = false;
  }
  const wasCollapsed = dom.sessionView.classList.contains("chat-collapsed");
  cancelBottomChatTransition();

  // En fullscreen apaisado móvil el chat inferior es una capa sobre el video.
  // No hay una segunda fila que revelar ni un scroll que llevar hasta el chat.
  if (isMobileLandscapeFullscreenBottomDock()) {
    applyExternalChatCollapsed(collapsed);
    return;
  }

  if (
    collapsed
    && dom.sessionView?.dataset.chatDock === "bottom"
    && dom.videoArea
  ) {
    const targetTop = getBottomDockVideoScrollTop();
    if (!wasCollapsed) {
      lockChatScrollSnapDuringProgrammaticScroll();
      if (isDesktopBottomDock()) {
        animateDesktopBottomChatCollapse(targetTop);
      } else {
        animateBottomChatCollapse(targetTop);
      }
      return;
    }
    if (Math.abs(getPageScrollTop() - targetTop) > 2) {
      lockChatScrollSnapDuringProgrammaticScroll();
      scrollPageTo(targetTop, isFullscreenPageActive() ? "auto" : "smooth");
    }
  }

  if (
    !collapsed
    && wasCollapsed
    && dom.sessionView?.dataset.chatDock === "bottom"
  ) {
    lockChatScrollSnapDuringProgrammaticScroll();
    if (isDesktopBottomDock()) {
      animateDesktopBottomChatExpand();
    } else {
      animateBottomChatExpand();
    }
    return;
  }

  applyExternalChatCollapsed(collapsed);
  restorePageScrollAfterRightChatCollapse(preservedPageScrollTop, {
    getPageScrollContainer,
    getPageScrollMax,
    getPageScrollTop,
    isCollapsed: () => dom.sessionView?.classList.contains("chat-collapsed"),
    scrollPageTo,
    durationMs: isMobileLandscapeRightDock() ? RIGHT_CHAT_SCROLL_LOCK_MS : undefined,
  });
}

export function forceExternalChatCollapsed() {
  if (!dom.sessionView || !dom.chatArea) return;

  clearAutoCollapseTimer(false);
  state.chat.autoOpenedExternal = false;
  cancelBottomChatTransition();
  clearBottomChatTransitionVisuals();
  focusOutsideChatAreaBeforeHiding();
  dom.chatArea.style.setProperty("transition", "none");
  dom.sessionView.classList.add("chat-collapsed");
  dom.chatArea.setAttribute("aria-hidden", "true");
  dom.chatArea.setAttribute("inert", "");
  updateCollapseButton();
  syncUnreadBadgesWithVisibility();
  syncExternalChatCollapseHandleOffset();
  window.requestAnimationFrame(() => {
    dom.chatArea?.style.removeProperty("transition");
  });
}

function applyExternalChatCollapsed(collapsed) {
  const previousVideoRect = getVideoAreaRect();
  if (collapsed) focusOutsideChatAreaBeforeHiding();
  clearAutoCollapseTimer(false);
  if (collapsed) cancelIdentityEditing();
  if (chatScrollSnapLockTimer) {
    window.clearTimeout(chatScrollSnapLockTimer);
    chatScrollSnapLockTimer = 0;
  }
  dom.sessionView.classList.remove("chat-scroll-snap-locked");
  if (expandScrollTimer) {
    window.clearTimeout(expandScrollTimer);
    expandScrollTimer = 0;
  }
  // La reducción del layout también genera un evento de scroll por el clamp
  // del viewport; evitar que el snap lo anime durante el reflow.
  lockChatScrollSnapDuringProgrammaticScroll(
    isMobileLandscapeRightDock()
      ? RIGHT_CHAT_SCROLL_LOCK_MS
      : CHAT_SCROLL_SNAP_LOCK_MS,
  );
  const handleSettleDelay = isRightChatViewportOverlay()
    ? RIGHT_CHAT_LAYOUT_TRANSITION_MS + 40
    : COLLAPSE_HANDLE_HIDE_MS;
  setCollapseHandleTransitioning(true, handleSettleDelay);
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  localStorage.setItem(EXTERNAL_CHAT_COLLAPSED_KEY, collapsed ? "1" : "0");
  if (!collapsed) dom.sessionView.classList.remove("chat-header-collapsed");
  animateExternalChatLayoutFrom(previousVideoRect);

  if (dom.chatArea) {
    dom.chatArea.setAttribute("aria-hidden", String(collapsed));
    if (collapsed) {
      dom.chatArea.setAttribute("inert", "");
    } else {
      dom.chatArea.removeAttribute("inert");
    }
  }
  if (!collapsed && dom.messages) {
    dom.messages.scrollTop = dom.messages.scrollHeight;
  }
  updateCollapseButton();
  syncUnreadBadgesWithVisibility();
  scheduleMessageTimeAdjustmentAfterLayout();
  scheduleExternalChatCollapseHandleOffset();

  if (!collapsed && state.chat.autoOpenedExternal) scheduleAutoCollapse(false);

  if (!collapsed) {
    if (dom.sessionView.dataset.chatDock === "bottom") return;

    // En landscape el chat se abre en la misma fila que el video. No hace
    // falta revelar el panel con scrollIntoView: hacerlo desplaza la página
    // verticalmente unos milisegundos después del toque, aunque el usuario
    // solo haya pedido recuperar el ancho del chat.
    if (isMobileLandscapeRightDock()) return;

    // En móvil el dock lateral ocupa una pantalla completa. Llevarlo al
    // viewport antes del primer repintado evita que se vea durante unos
    // instantes el espacio superior de la barra de sesión antes del chat.
    if (
      dom.sessionView.dataset.chatDock === "right"
      && window.matchMedia("(max-width: 680px)").matches
      && dom.workspace
    ) {
      const targetTop = Math.min(getPageScrollMax(), Math.max(0, Math.round(getElementPageTop(dom.workspace))));
      scrollPageTo(targetTop, "auto");
      return;
    }

    expandScrollTimer = window.setTimeout(() => {
      expandScrollTimer = 0;
      window.requestAnimationFrame(() => {
        if (dom.sessionView.dataset.chatDock === "bottom" && dom.chatArea) {
          revealBottomDockUnion();
          return;
        }

        dom.chatArea?.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "smooth",
        });
      });
    }, CHAT_LAYOUT_SETTLE_MS + 40);
    return;
  }

  // Mantener el reproductor anclado al viewport al cerrar el overlay. Sin
  // este ajuste, el clamp del documento devuelve el scroll al inicio y deja
  // fuera de vista la parte superior del video a pesar de que su alto sea el
  // del viewport completo.
  if (isRightChatViewportOverlay() && dom.workspace) {
    const targetTop = Math.min(
      getPageScrollMax(),
      Math.max(0, Math.round(getElementPageTop(dom.workspace))),
    );
    scrollPageTo(targetTop, "auto");
    return;
  }

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen && !(collapsed && isMobileLandscapeRightDock())) {
    focusFullscreenWorkspace();
  }
}

function focusOutsideChatAreaBeforeHiding() {
  const chatArea = dom.chatArea;
  if (!chatArea?.contains(document.activeElement)) return;

  const focusTarget = [dom.playerChatToggleButton, dom.playerPlayButton].find((element) => {
    if (!element?.isConnected || element.disabled || !element.getClientRects().length) return false;
    if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    return window.getComputedStyle(element).visibility !== "hidden";
  });
  focusTarget?.focus({ preventScroll: true });

  if (chatArea.contains(document.activeElement)) {
    document.activeElement.blur?.();
  }
}

export function restoreExternalChatCollapsed() {
  if (localStorage.getItem(EXTERNAL_CHAT_COLLAPSED_KEY) !== "1") return;

  focusOutsideChatAreaBeforeHiding();
  dom.sessionView.classList.add("chat-collapsed");
  dom.chatArea?.setAttribute("aria-hidden", "true");
  dom.chatArea?.setAttribute("inert", "");
  updateCollapseButton();
  syncUnreadBadgesWithVisibility();
  scheduleExternalChatCollapseHandleOffset();
}

export function setInsideChatAutoExpandEnabled(enabled) {
  state.chat.autoExpandInsideEnabled = Boolean(enabled);
  if (!state.chat.autoExpandInsideEnabled) {
    clearAutoCollapseTimer(true);
  }
  localStorage.setItem(AUTO_EXPAND_INSIDE_KEY, enabled ? "1" : "0");
  updateAutoExpandSwitch(dom.insideChatAutoExpandSwitch, state.chat.autoExpandInsideEnabled, "chat interno");
  logEvent("ui", `Autoexpandir chat interno: ${state.chat.autoExpandInsideEnabled ? "activado" : "desactivado"}.`);
}

export function setExternalChatAutoExpandEnabled(enabled) {
  state.chat.autoExpandExternalEnabled = Boolean(enabled);
  if (!state.chat.autoExpandExternalEnabled) {
    clearAutoCollapseTimer(false);
  }
  localStorage.setItem(AUTO_EXPAND_EXTERNAL_KEY, enabled ? "1" : "0");
  updateAutoExpandSwitch(dom.externalChatAutoExpandSwitch, state.chat.autoExpandExternalEnabled, "chat externo");
  logEvent("ui", `Autoexpandir chat externo: ${state.chat.autoExpandExternalEnabled ? "activado" : "desactivado"}.`);
}

export function scheduleInsideChatAutoCollapse() {
  scheduleAutoCollapse(true);
}

export function scheduleExternalChatAutoCollapse() {
  scheduleAutoCollapse(false);
}

export function cancelExternalChatAutoCollapse() {
  clearAutoCollapseTimer(false);
  state.chat.autoOpenedExternal = false;
}

export function completeAutoOpenedChatResponse(isOverlay) {
  const openedKey = isOverlay ? "autoOpenedInside" : "autoOpenedExternal";
  if (!state.chat[openedKey]) return false;

  if (isOverlay) {
    resetInsideUnread();
    setInsideChatVisible(false, { source: "response" });
  } else {
    resetInsideUnread();
    resetPageUnread();
    setExternalChatCollapsed(true, { source: "response" });
  }
  return true;
}

export function syncChatAutoExpandControls() {
  updateAutoExpandSwitch(dom.insideChatAutoExpandSwitch, state.chat.autoExpandInsideEnabled, "chat interno");
  updateAutoExpandSwitch(dom.externalChatAutoExpandSwitch, state.chat.autoExpandExternalEnabled, "chat externo");
}

export function updateCollapseButton() {
  // Cada estado tiene su propio botón y anclaje. Solo cambia la visibilidad
  // semántica y el icono de cada acción; ningún nodo se reposiciona entre
  // contraer y expandir.
  hideTooltip(true);
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const isPortraitMobileRightDock =
    dock === "right"
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: portrait)").matches;
  const isFullscreenLandscapeBottomDock =
    dock === "bottom"
    && isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
  const isDesktopLayout = !isStackedSessionLayout();
  const iconName = isFullscreenLandscapeBottomDock
    ? collapsed
      ? "arrow-up"
      : "arrow-down"
    : isDesktopLayout
    ? collapsed
      ? dock === "right"
        ? "arrow-left"
        : "arrow-down"
      : dock === "right"
        ? "arrow-right"
        : "arrow-up"
    : dock === "right"
      ? isPortraitMobileRightDock
        ? collapsed
          ? "arrow-left"
          : "arrow-right"
        : collapsed
          ? "arrow-left"
          : "arrow-right"
      : dock === "bottom"
        ? collapsed
          ? "arrow-down"
          : "arrow-up"
        : collapsed
          ? "arrow-up"
          : "arrow-down";

  const controls = [
    { button: dom.collapseChatButton, isCollapsedState: false },
    { button: dom.expandChatButton, isCollapsedState: true },
  ];
  controls.forEach(({ button, isCollapsedState }) => {
    if (!button) return;
    const label = isCollapsedState ? "Expandir chat" : "Contraer chat";
    const controlIconName = isCollapsedState === collapsed
      ? iconName
      : isFullscreenLandscapeBottomDock
        ? isCollapsedState ? "arrow-up" : "arrow-down"
        : iconName;
    const iconAnchor = button.querySelector(".chat-collapse-icon-anchor");
    const icon = iconAnchor?.querySelector("[data-lucide]");
    button.dataset.tooltip = label;
    button.removeAttribute("title");
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-hidden", String(isCollapsedState !== collapsed));
    // Las flechas cambian de anclaje mientras el panel se anima. El tooltip
    // no debe volver a programarse sobre el control que queda bajo el puntero.
    iconAnchor?.removeAttribute("data-tooltip");
    button.setAttribute("tabindex", "-1");
    button.blur();
    if (icon) {
      icon.setAttribute("data-lucide", controlIconName);
      icon.innerHTML = "";
    }
  });
  hydrateIcons();
}

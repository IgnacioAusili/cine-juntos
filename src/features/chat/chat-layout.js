// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { CHAT_DOCKS, CHAT_DOCK_META, withShortcutHint } from "../../core/utils.js";
import { hydrateIcons, hideTooltip, refreshTooltipForTarget } from "../icons-tooltips.js";
import { focusFullscreenWorkspace } from "../session-ui.js?v=20260827-entry-scroll-fix-01";
import {
  cancelIdentityEditing,
  syncNameInputWidth,
} from "../presence.js?v=20260901-chat-arrow-unified-03";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
  resetInsideUnread,
  resetPageUnread,
  syncUnreadBadgesWithVisibility,
} from "./unread-counters.js";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20260811-layout-motion-01";
import { focusChatInput } from "./chat-input-focus.js";
import { restorePageScrollAfterRightChatCollapse } from "./chat-scroll-preservation.js?v=20260902-chat-landscape-handle-settle-01";

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
const CHAT_USER_SCROLL_LOCK_MS = 900;
const BOTTOM_CHAT_CURTAIN_MS = 320;
const BOTTOM_CHAT_SCROLL_TIMEOUT_MS = 1200;
const BOTTOM_DOCK_UNION_REVEAL_PX = 0;
const BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS = 1200;
const BOTTOM_TO_RIGHT_LAYOUT_MS = 280;

let layoutAdjustmentTimer = 0;
let collapseHandleOffsetTimer = 0;
let expandScrollTimer = 0;
let chatScrollSnapLockTimer = 0;
let chatUserScrollUnlockTimer = 0;
let pendingBottomToRightSwitch = null;
let externalChatVisualMotionTimer = 0;
let bottomChatTransition = null;
let pendingRightDockCollapseScrollTop = null;

function getVideoAreaRect() {
  if (!dom.videoArea) return null;
  const rect = dom.videoArea.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function isMobileLayoutViewport() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function isMobileLandscapeRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && window.matchMedia("(max-width: 980px) and (orientation: landscape)").matches;
}

// La grilla debe cambiar de una vez para evitar que el texto se reenvuelva en
// cada frame. Esta transición FLIP conserva el movimiento visual del video sin
// volver a calcular el contenido del chat ni los controles durante el trayecto.
function animateExternalChatLayoutFrom(previousRect) {
  if (!dom.sessionView || !dom.videoArea || !previousRect) return;

  if (
    isMobileLayoutViewport()
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
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
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

const PAGE_SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
  "Spacebar",
]);
const PAGE_SCROLL_LOCK_LISTENER_OPTIONS = { capture: true, passive: false };

function isChatScrollTarget(target) {
  return target instanceof Element && Boolean(target.closest("#messages, #overlayMessages, textarea"));
}

function preventPageScrollDuringChatTransition(event) {
  if (isChatScrollTarget(event.target)) return;
  event.preventDefault();
}

function preventPageScrollKeysDuringChatTransition(event) {
  if (!PAGE_SCROLL_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLElement && target.isContentEditable
  ) {
    return;
  }

  event.preventDefault();
}

function unlockUserScrollDuringChatTransition() {
  document.removeEventListener("wheel", preventPageScrollDuringChatTransition, true);
  document.removeEventListener("touchmove", preventPageScrollDuringChatTransition, true);
  document.removeEventListener("keydown", preventPageScrollKeysDuringChatTransition, true);
  dom.sessionView?.classList.remove("chat-user-scroll-locked");
  chatUserScrollUnlockTimer = 0;
}

function lockUserScrollDuringChatTransition() {
  if (!dom.sessionView || dom.sessionView.hidden) return;

  document.removeEventListener("wheel", preventPageScrollDuringChatTransition, true);
  document.removeEventListener("touchmove", preventPageScrollDuringChatTransition, true);
  document.removeEventListener("keydown", preventPageScrollKeysDuringChatTransition, true);
  document.addEventListener(
    "wheel",
    preventPageScrollDuringChatTransition,
    PAGE_SCROLL_LOCK_LISTENER_OPTIONS,
  );
  document.addEventListener(
    "touchmove",
    preventPageScrollDuringChatTransition,
    PAGE_SCROLL_LOCK_LISTENER_OPTIONS,
  );
  document.addEventListener(
    "keydown",
    preventPageScrollKeysDuringChatTransition,
    PAGE_SCROLL_LOCK_LISTENER_OPTIONS,
  );
  dom.sessionView.classList.add("chat-user-scroll-locked");

  if (chatUserScrollUnlockTimer) {
    window.clearTimeout(chatUserScrollUnlockTimer);
  }
  chatUserScrollUnlockTimer = window.setTimeout(
    unlockUserScrollDuringChatTransition,
    CHAT_USER_SCROLL_LOCK_MS,
  );
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

  const collapseHandleZone = dom.collapseChatButton.closest(".chat-collapse-hover-zone");

  if (state.chat.collapseHandleTransitionTimer) {
    window.clearTimeout(state.chat.collapseHandleTransitionTimer);
    state.chat.collapseHandleTransitionTimer = null;
  }

  dom.collapseChatButton.classList.toggle("is-transitioning", isTransitioning);
  collapseHandleZone?.classList.toggle("is-transitioning", isTransitioning);
  dom.sessionView?.classList.toggle("chat-layout-transitioning", isTransitioning);
  const messageForm = dom.chatArea?.querySelector(".message-form");
  if (isTransitioning && dom.sessionView?.dataset.chatDock === "right") {
    messageForm?.style.setProperty("width", "calc(var(--chat-panel-width) - 37px)");
  }
  if (!isTransitioning) return;

  state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
    dom.collapseChatButton.classList.remove("is-transitioning");
    collapseHandleZone?.classList.remove("is-transitioning");
    dom.sessionView?.classList.remove("chat-layout-transitioning");
    messageForm?.style.removeProperty("width");
    state.chat.collapseHandleTransitionTimer = null;
    syncExternalChatCollapseHandleOffset();
    window.dispatchEvent(new Event("chat-layout-settled"));
  }, settleDelayMs);
}

function scheduleAutoCollapse(isOverlay) {
  const enabled = isOverlay
    ? state.chat.autoExpandInsideEnabled
    : state.chat.autoExpandExternalEnabled;
  const autoOpenedKey = isOverlay ? "autoOpenedInside" : "autoOpenedExternal";
  if (!enabled || !state.chat[autoOpenedKey]) return;

  clearAutoCollapseTimer(isOverlay);
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  state.chat[timerKey] = window.setTimeout(() => {
    state.chat[timerKey] = null;
    if (isOverlay) {
      if (!dom.playerFrame.classList.contains("chat-inside-open")) return;
      setInsideChatVisible(false, { source: "auto-timeout" });
    } else {
      if (dom.sessionView.classList.contains("chat-collapsed")) return;
      setExternalChatCollapsed(true, { source: "auto-timeout" });
    }
  }, AUTO_COLLAPSE_DELAY_MS);
}

export function setInsideChatVisible(visible, options = {}) {
  const source = options.source || "user";
  const wasVisible = dom.playerFrame.classList.contains("chat-inside-open");
  if (wasVisible !== visible && !options.skipScrollLock) lockUserScrollDuringChatTransition();
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
  if (visible) {
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

  if ((dom.sessionView.dataset.chatDock || "right") !== "bottom") {
    const isMobileRightDock =
      (dom.sessionView.dataset.chatDock || "right") === "right"
      && window.matchMedia("(max-width: 980px)").matches;
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
  const handleTop = chatHeaderRect && !isPortraitMobileBottomDock
    ? Math.max(0, Math.round(chatHeaderRect.top - workspaceRect.top + chatHeaderRect.height / 2))
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

function lockChatScrollSnapDuringProgrammaticScroll() {
  if (!dom.sessionView) return;

  dom.sessionView.classList.add("chat-scroll-snap-locked");
  if (chatScrollSnapLockTimer) {
    window.clearTimeout(chatScrollSnapLockTimer);
  }
  chatScrollSnapLockTimer = window.setTimeout(() => {
    chatScrollSnapLockTimer = 0;
    dom.sessionView.classList.remove("chat-scroll-snap-locked");
  }, CHAT_SCROLL_SNAP_LOCK_MS);
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

export function setChatDock(dock, options = {}) {
  const nextDock = CHAT_DOCKS.includes(dock) ? dock : "right";
  const currentDock = dom.sessionView?.dataset.chatDock || "right";
  const centeredVideoScrollTop = getBottomToRightScrollTop();

  if (
    !options.skipTransition
    && currentDock === "bottom"
    && nextDock === "right"
  ) {
    scheduleBottomToRightSwitch(nextDock, centeredVideoScrollTop);
    return;
  }

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
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
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
    : window.innerHeight;
  const centeredVideoTop =
    getElementPageTop(dom.videoArea) + videoRect.height / 2 - viewportHeight / 2;

  return Math.min(maxScrollTop, Math.max(0, Math.round(centeredVideoTop)));
}

function scheduleBottomToRightSwitch(nextDock, targetScrollTop) {
  if (pendingBottomToRightSwitch) return;

  const transition = {
    frameId: 0,
    timeoutId: 0,
  };
  pendingBottomToRightSwitch = transition;

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

    // Separar el cambio de clase del cambio de dock permite que la grilla
    // tenga un estado inicial estable antes de extender el panel lateral.
    // Este es el único cambio de grilla animado entre docks. Durante él no
    // se deben recalcular offsets ni reservas del compositor por cada frame.
    setCollapseHandleTransitioning(true, BOTTOM_TO_RIGHT_LAYOUT_MS + 80);
    dom.sessionView.classList.add("chat-dock-switching");
    window.requestAnimationFrame(() => {
      setChatDock(nextDock, { skipTransition: true });
      // Confirmar el estado lateral colapsado antes de habilitar la entrada.
      // Sin esta lectura el navegador puede agrupar ambos estados y saltar
      // directamente de dock inferior a 320px.
      void dom.chatArea?.offsetWidth;
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
        window.setTimeout(() => {
          dom.sessionView.classList.remove("chat-dock-switching", "chat-dock-switching-entered");
        }, BOTTOM_TO_RIGHT_LAYOUT_MS + 80);
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
}

function cancelBottomChatTransition() {
  if (bottomChatTransition) {
    window.cancelAnimationFrame(bottomChatTransition.frameId);
    window.clearTimeout(bottomChatTransition.timeoutId);
    bottomChatTransition = null;
  }
  clearBottomChatTransitionVisuals();
}

function isDesktopBottomDock() {
  return dom.sessionView?.dataset.chatDock === "bottom"
    && !isMobileLayoutViewport();
}

function completeDesktopBottomChatTransition(transition) {
  if (bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
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
  dom.chatArea?.style.setProperty(
    "opacity",
    String(transition.collapsed ? 1 - easedProgress : easedProgress),
  );

  const scrollProgress = transition.startScrollTop
    + ((transition.targetScrollTop - transition.startScrollTop) * easedProgress);
  scrollPageTo(Math.round(scrollProgress), "auto");
}

function completeMobileBottomChatTransition(transition) {
  if (bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
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
    startScrollTop: 0,
    targetScrollTop: 0,
  };
  bottomChatTransition = transition;
  dom.sessionView.classList.add("chat-bottom-pc-expand-visual");
  setDesktopBottomChatCurtainProgress(100);
  // Se reserva la fila completa con la cortina cerrada. Desde el primer frame
  // el scroll y la apertura recorren juntos la distancia hasta la unión.
  applyExternalChatCollapsed(false);
  setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  transition.startScrollTop = getPageScrollTop();
  transition.targetScrollTop = getBottomDockChatScrollTop();
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
  const mobileViewport = window.matchMedia("(max-width: 680px)").matches;
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
  if (wasCollapsed !== collapsed) lockUserScrollDuringChatTransition();
  cancelBottomChatTransition();

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
  });
}

function applyExternalChatCollapsed(collapsed) {
  const previousVideoRect = getVideoAreaRect();
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
  lockChatScrollSnapDuringProgrammaticScroll();
  const handleSettleDelay = !collapsed && isMobileLandscapeRightDock()
    ? RIGHT_CHAT_LAYOUT_TRANSITION_MS
    : COLLAPSE_HANDLE_HIDE_MS;
  setCollapseHandleTransitioning(true, handleSettleDelay);
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  localStorage.setItem(EXTERNAL_CHAT_COLLAPSED_KEY, collapsed ? "1" : "0");
  if (!collapsed) dom.sessionView.classList.remove("chat-header-collapsed");
  animateExternalChatLayoutFrom(previousVideoRect);

  if (dom.chatArea) {
    if (collapsed && dom.chatArea.contains(document.activeElement) && !isMobileLandscapeRightDock()) {
      dom.videoPlayer?.focus({ preventScroll: true });
    }
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

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen && !(collapsed && isMobileLandscapeRightDock())) {
    focusFullscreenWorkspace();
  }
}

export function restoreExternalChatCollapsed() {
  if (localStorage.getItem(EXTERNAL_CHAT_COLLAPSED_KEY) !== "1") return;

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
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const iconAnchor = dom.collapseChatButton.querySelector(".chat-collapse-icon-anchor");
  const icon = iconAnchor?.querySelector("[data-lucide]");
  dom.collapseChatButton.removeAttribute("data-tooltip");
  const isPortraitMobileRightDock =
    dock === "right"
    && window.matchMedia("(max-width: 980px) and (orientation: portrait)").matches;
  const isDesktopLayout = window.matchMedia("(min-width: 981px)").matches;
  const iconName = isDesktopLayout
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
  const label = collapsed ? "Expandir chat" : "Contraer chat";

  dom.collapseChatButton.removeAttribute("title");
  dom.collapseChatButton.setAttribute("aria-label", label);
  if (iconAnchor) {
    iconAnchor.dataset.tooltip = label;
  } else {
    dom.collapseChatButton.dataset.tooltip = label;
  }
  if (icon) {
    icon.setAttribute("data-lucide", iconName);
    icon.innerHTML = "";
  }
  hydrateIcons();
}

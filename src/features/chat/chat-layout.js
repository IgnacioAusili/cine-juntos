// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { CHAT_DOCKS, CHAT_DOCK_META, withShortcutHint } from "../../core/utils.js";
import { hydrateIcons, refreshTooltipForTarget } from "../icons-tooltips.js";
import { focusFullscreenWorkspace } from "../session-ui.js";
import { cancelIdentityEditing } from "../presence.js?v=20260810-chat-fixes-04";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
  syncUnreadBadgesWithVisibility,
} from "./unread-counters.js";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20260731-03";

const AUTO_COLLAPSE_DELAY_MS = 3200;
const AUTO_EXPAND_INSIDE_KEY = "cine-juntos-chat-auto-expand-inside";
const AUTO_EXPAND_EXTERNAL_KEY = "cine-juntos-chat-auto-expand-external";
const CHAT_LAYOUT_SETTLE_MS = 320;
const COLLAPSE_HANDLE_HIDE_MS = CHAT_LAYOUT_SETTLE_MS + 40;
const CHAT_SCROLL_SNAP_LOCK_MS = 900;
const CHAT_USER_SCROLL_LOCK_MS = 900;
const BOTTOM_DOCK_UNION_REVEAL_PX = 0;
const BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS = 1200;
const BOTTOM_TO_RIGHT_LAYOUT_MS = 420;

let layoutAdjustmentTimer = 0;
let collapseHandleOffsetTimer = 0;
let expandScrollTimer = 0;
let chatScrollSnapLockTimer = 0;
let chatUserScrollUnlockTimer = 0;
let pendingCollapseScrollFinish = null;
let pendingBottomToRightSwitch = null;

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
  const chatTop = getElementPageTop(dom.chatArea);
  scrollPageTo(Math.max(0, Math.round(chatTop - BOTTOM_DOCK_UNION_REVEAL_PX)), nextBehavior);
  window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);
}

function scheduleMessageTimeAdjustmentAfterLayout() {
  scheduleMessageTimeAdjustment();
  if (layoutAdjustmentTimer) {
    window.clearTimeout(layoutAdjustmentTimer);
  }
  layoutAdjustmentTimer = window.setTimeout(() => {
    layoutAdjustmentTimer = 0;
    scheduleMessageTimeAdjustment();
  }, CHAT_LAYOUT_SETTLE_MS);
}

function setCollapseHandleTransitioning(isTransitioning) {
  if (!dom.collapseChatButton) return;

  const collapseHandleZone = dom.collapseChatButton.closest(".chat-collapse-hover-zone");

  if (state.chat.collapseHandleTransitionTimer) {
    window.clearTimeout(state.chat.collapseHandleTransitionTimer);
    state.chat.collapseHandleTransitionTimer = null;
  }

  dom.collapseChatButton.classList.toggle("is-transitioning", isTransitioning);
  collapseHandleZone?.classList.toggle("is-transitioning", isTransitioning);
  dom.sessionView?.classList.toggle("chat-layout-transitioning", isTransitioning);
  if (!isTransitioning) return;

  state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
    dom.collapseChatButton.classList.remove("is-transitioning");
    collapseHandleZone?.classList.remove("is-transitioning");
    dom.sessionView?.classList.remove("chat-layout-transitioning");
    state.chat.collapseHandleTransitionTimer = null;
  }, COLLAPSE_HANDLE_HIDE_MS);
}

function scheduleAutoCollapse(isOverlay) {
  const enabled = isOverlay
    ? state.chat.autoExpandInsideEnabled
    : state.chat.autoExpandExternalEnabled;
  const isVisible = isOverlay ? isInsideChatVisibleToUser() : isExternalChatVisibleToUser();
  if (!enabled || !isVisible) return;

  clearAutoCollapseTimer(isOverlay);
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  state.chat[timerKey] = window.setTimeout(() => {
    state.chat[timerKey] = null;
    if (isOverlay) {
      if (!isInsideChatVisibleToUser()) return;
      setInsideChatVisible(false);
    } else {
      if (!isExternalChatVisibleToUser()) return;
      setExternalChatCollapsed(true);
    }
  }, AUTO_COLLAPSE_DELAY_MS);
}

export function setInsideChatVisible(visible) {
  const wasVisible = dom.playerFrame.classList.contains("chat-inside-open");
  if (wasVisible !== visible) lockUserScrollDuringChatTransition();
  clearAutoCollapseTimer(true);
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
      dom.overlayMessageInput?.focus({ preventScroll: true });
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
  scheduleMessageTimeAdjustmentAfterLayout();
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

  if ((dom.sessionView.dataset.chatDock || "right") !== "bottom") {
    dom.sessionView.style.removeProperty("--chat-bottom-dock-handle-top");
    dom.sessionView.style.removeProperty("--chat-bottom-dock-collapsed-handle-top");
    return;
  }

  const workspaceRect = dom.workspace.getBoundingClientRect();
  const chatRect = dom.chatArea.getBoundingClientRect();
  const parsedDockGap = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--chat-bottom-dock-gap"),
  );
  const dockGap = Number.isFinite(parsedDockGap) ? parsedDockGap : 24;
  const parsedArrowOffset = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--chat-bottom-header-arrow-offset"),
  );
  const arrowOffset = Number.isFinite(parsedArrowOffset) ? parsedArrowOffset : 16;
  const handleTop = Math.max(
    0,
    Math.round(chatRect.top - workspaceRect.top + arrowOffset - dockGap / 2),
  );
  const playerControlBar = dom.playerFrame?.querySelector(".player-controls-bar");
  const playerControlBarRect = playerControlBar?.getBoundingClientRect();
  const playerFrameRect = dom.playerFrame?.getBoundingClientRect();
  const collapsedHandleTop = playerControlBarRect
    ? Math.round(playerControlBarRect.top - workspaceRect.top - 17)
    : playerFrameRect
      ? Math.round(playerFrameRect.bottom - workspaceRect.top - 80)
      : 0;
  dom.sessionView.style.setProperty("--chat-bottom-dock-handle-top", `${handleTop}px`);
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

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
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

  const meta = CHAT_DOCK_META[nextDock];
  const icon = dom.dockChatButton.querySelector("[data-lucide]");

  cancelIdentityEditing();
  dom.sessionView.dataset.chatDock = nextDock;
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
  syncUnreadBadgesWithVisibility();
  scheduleExternalChatCollapseHandleOffset();
  logEvent("ui", `Chat lateral en posicion: ${meta.label}.`);

  if (nextDock === "bottom" && !dom.sessionView.classList.contains("chat-collapsed")) {
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
    dom.sessionView.classList.add("chat-dock-switching");
    window.requestAnimationFrame(() => {
      setChatDock(nextDock, { skipTransition: true });
      window.requestAnimationFrame(() => {
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

function clearPendingCollapseScroll() {
  if (!pendingCollapseScrollFinish) return;
  pendingCollapseScrollFinish.cancel();
  pendingCollapseScrollFinish = null;
}

function getBottomDockVideoScrollTop() {
  if (!dom.sessionView || !dom.videoArea) return 0;

  const gutter = Number.parseFloat(
    getComputedStyle(dom.sessionView).getPropertyValue("--app-shell-gutter"),
  ) || 0;
  return Math.max(0, Math.round(getElementPageTop(dom.videoArea) - gutter));
}

export function setExternalChatCollapsed(collapsed) {
  const wasCollapsed = dom.sessionView.classList.contains("chat-collapsed");
  if (wasCollapsed !== collapsed) lockUserScrollDuringChatTransition();
  clearPendingCollapseScroll();

  if (
    collapsed
    && dom.sessionView?.dataset.chatDock === "bottom"
    && dom.videoArea
  ) {
    const targetTop = getBottomDockVideoScrollTop();
    if (Math.abs(window.scrollY - targetTop) > 2) {
      lockChatScrollSnapDuringProgrammaticScroll();
      setCollapseHandleTransitioning(true);
      window.scrollTo({ top: targetTop, behavior: "smooth" });

      // Mantener la fila visible durante toda la animación evita que el
      // navegador recorte el scroll de golpe antes de que termine el viaje.
      const collapseTimer = window.setTimeout(() => {
        pendingCollapseScrollFinish = null;
        applyExternalChatCollapsed(true);
      }, CHAT_LAYOUT_SETTLE_MS + 220);
      pendingCollapseScrollFinish = {
        cancel: () => window.clearTimeout(collapseTimer),
      };
      return;
    }
  }

  applyExternalChatCollapsed(collapsed);
}

function applyExternalChatCollapsed(collapsed) {
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
  setCollapseHandleTransitioning(true);
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);

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
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");

  if (!collapsed) {
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
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
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
  const iconName =
    dock === "right"
      ? collapsed
        ? "chevron-left"
        : "chevron-right"
      : dock === "bottom"
        ? collapsed
          ? "chevron-down"
          : "chevron-up"
        : collapsed
          ? "chevron-up"
          : "chevron-down";
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

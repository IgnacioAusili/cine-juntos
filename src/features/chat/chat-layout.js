// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";
import { CHAT_DOCKS, CHAT_DOCK_META, withShortcutHint } from "../../core/utils.js";
import { hydrateIcons, refreshTooltipForTarget } from "../icons-tooltips.js";
import { focusFullscreenWorkspace } from "../session-ui.js";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
  syncUnreadBadgesWithVisibility,
} from "./unread-counters.js";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js";

const AUTO_COLLAPSE_DELAY_MS = 3200;
const AUTO_EXPAND_INSIDE_KEY = "cine-juntos-chat-auto-expand-inside";
const AUTO_EXPAND_EXTERNAL_KEY = "cine-juntos-chat-auto-expand-external";
const COLLAPSE_HANDLE_HIDE_MS = 260;

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

function setCollapseHandleTransitioning(isTransitioning) {
  if (!dom.collapseChatButton) return;

  if (state.chat.collapseHandleTransitionTimer) {
    window.clearTimeout(state.chat.collapseHandleTransitionTimer);
    state.chat.collapseHandleTransitionTimer = null;
  }

  dom.collapseChatButton.classList.toggle("is-transitioning", isTransitioning);
  if (!isTransitioning) return;

  state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
    dom.collapseChatButton.classList.remove("is-transitioning");
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
  clearAutoCollapseTimer(true);
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
      if (dom.videoPlayer) {
        dom.videoPlayer.tabIndex = -1;
        dom.videoPlayer.focus({ preventScroll: true });
      } else {
        dom.playerFrame?.focus?.({ preventScroll: true });
      }
    });
  }
  refreshTooltipForTarget(dom.playerChatToggleButton);
  syncUnreadBadgesWithVisibility();
  scheduleMessageTimeAdjustment();
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

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
  scheduleMessageTimeAdjustment();
  logEvent("ui", `Estilo de chat interno: ${nextStyle}.`);
}

export function setChatDock(dock) {
  const nextDock = CHAT_DOCKS.includes(dock) ? dock : "right";
  const meta = CHAT_DOCK_META[nextDock];
  const icon = dom.dockChatButton.querySelector("[data-lucide]");

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
  logEvent("ui", `Chat lateral en posicion: ${meta.label}.`);

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
}

export function setExternalChatCollapsed(collapsed) {
  clearAutoCollapseTimer(false);
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
  scheduleMessageTimeAdjustment();
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");

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

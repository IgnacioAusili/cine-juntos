import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { withShortcutHint } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { refreshTooltipForTarget } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { resetInsideUnread, resetPageUnread, syncUnreadBadgesWithVisibility } from "./unread-counters.js?v=20261010-file-size-refactor-02";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import { wireInsideChatPanelPlacement, syncInsideChatPanelPlacement, preserveInsideChatPanelPlacementWhileClosing } from "../player/inside-chat-layout.js?v=20261010-file-size-refactor-02";
import { isMobileLandscapeFullscreenBottomDock } from "./chat-layout-breakpoints.js?v=20261010-file-size-refactor-02";
import { cancelIdentityEditing } from "../presence.js?v=20261010-file-size-refactor-02";
import { syncInsideChatPanelOffset } from "./chat-collapse-handles.js?v=20261010-file-size-refactor-02";

const AUTO_COLLAPSE_DELAY_MS = 5000;
const AUTO_EXPAND_INSIDE_KEY = "cine-juntos-chat-auto-expand-inside";
const AUTO_EXPAND_EXTERNAL_KEY = "cine-juntos-chat-auto-expand-external";
const chatVisibilityOperations = {};

export function configureChatVisibilityOperations(operations) {
  Object.assign(chatVisibilityOperations, operations || {});
}

function getChatVisibilityOperations() {
  if (!chatVisibilityOperations.setExternalChatCollapsed || !chatVisibilityOperations.scheduleMessageTimeAdjustmentAfterLayout) {
    throw new Error("El layout del chat debe configurar las operaciones de visibilidad antes de usarlas.");
  }
  return chatVisibilityOperations;
}

function getAutoExpandTooltip(enabled) {
  return enabled ? "Desactivar" : "Activar";
}

function updateAutoExpandSwitch(button, enabled, label) {
  if (!button) return;
  const tooltip = getAutoExpandTooltip(enabled);
  button.classList.toggle("active", enabled);
  button.setAttribute("aria-checked", String(enabled));
  button.setAttribute("aria-label", `Autoexpandir ${label}`);
  button.dataset.tooltip = tooltip;
  button.removeAttribute("title");
  refreshTooltipForTarget(button);
}

export function clearChatAutoCollapseTimer(isOverlay) {
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  const timerId = state.chat[timerKey];
  if (timerId) {
    window.clearTimeout(timerId);
    state.chat[timerKey] = null;
  }
}

function scheduleAutoCollapse(isOverlay) {
  const enabled = isOverlay
    ? state.chat.autoExpandInsideEnabled
    : state.chat.autoExpandExternalEnabled;
  const autoOpenedKey = isOverlay ? "autoOpenedInside" : "autoOpenedExternal";
  if (!isOverlay && isMobileLandscapeFullscreenBottomDock()) return;
  if (!enabled || !state.chat[autoOpenedKey]) return;

  clearChatAutoCollapseTimer(isOverlay);
  const timerKey = isOverlay ? "autoCollapseInsideTimer" : "autoCollapseExternalTimer";
  state.chat[timerKey] = window.setTimeout(() => {
    state.chat[timerKey] = null;
    if (isOverlay) {
      if (!dom.playerFrame.classList.contains("chat-inside-open")) return;
      setInsideChatVisible(false, { source: "auto-timeout" });
    } else {
      if (isMobileLandscapeFullscreenBottomDock()) return;
      if (dom.sessionView.classList.contains("chat-collapsed")) return;
      getChatVisibilityOperations().setExternalChatCollapsed(true, { source: "auto-timeout" });
    }
  }, AUTO_COLLAPSE_DELAY_MS);
}

export function setInsideChatVisible(visible, options = {}) {
  wireInsideChatPanelPlacement();
  const source = options.source || "user";
  clearChatAutoCollapseTimer(true);
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
  getChatVisibilityOperations().scheduleMessageTimeAdjustmentAfterLayout();
  if (visible && source === "auto") scheduleAutoCollapse(true);
  logEvent("ui", visible ? "Chat interno visible." : "Chat interno oculto.");
}

export function setInsideChatAutoExpandEnabled(enabled) {
  state.chat.autoExpandInsideEnabled = Boolean(enabled);
  if (!state.chat.autoExpandInsideEnabled) {
    clearChatAutoCollapseTimer(true);
  }
  localStorage.setItem(AUTO_EXPAND_INSIDE_KEY, enabled ? "1" : "0");
  updateAutoExpandSwitch(dom.insideChatAutoExpandSwitch, state.chat.autoExpandInsideEnabled, "chat interno");
  logEvent("ui", `Autoexpandir chat interno: ${state.chat.autoExpandInsideEnabled ? "activado" : "desactivado"}.`);
}

export function setExternalChatAutoExpandEnabled(enabled) {
  state.chat.autoExpandExternalEnabled = Boolean(enabled);
  if (!state.chat.autoExpandExternalEnabled) {
    clearChatAutoCollapseTimer(false);
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
  clearChatAutoCollapseTimer(false);
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
    getChatVisibilityOperations().setExternalChatCollapsed(true, { source: "response" });
  }
  return true;
}

export function syncChatAutoExpandControls() {
  updateAutoExpandSwitch(dom.insideChatAutoExpandSwitch, state.chat.autoExpandInsideEnabled, "chat interno");
  updateAutoExpandSwitch(dom.externalChatAutoExpandSwitch, state.chat.autoExpandExternalEnabled, "chat externo");
}

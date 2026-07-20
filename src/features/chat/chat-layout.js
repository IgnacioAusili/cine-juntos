// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { logEvent } from "../../core/state.js";
import { CHAT_DOCKS, CHAT_DOCK_META } from "../../core/utils.js";
import { hydrateIcons, refreshTooltipForTarget } from "../icons-tooltips.js";
import { focusFullscreenWorkspace } from "../session-ui.js";
import { syncUnreadBadgesWithVisibility } from "./unread-counters.js";

export function setInsideChatVisible(visible) {
  dom.playerFrame.classList.toggle("chat-inside-open", visible);
  dom.playerChatToggleButton.classList.toggle("active", visible);
  dom.playerChatToggleButton.setAttribute("aria-pressed", String(visible));
  const tooltipLabel = visible ? "Ocultar chat" : "Mostrar chat";
  dom.playerChatToggleButton.dataset.tooltip = tooltipLabel;
  dom.playerChatToggleButton.setAttribute("aria-label", tooltipLabel);
  dom.playerChatToggleButton.removeAttribute("title");
  refreshTooltipForTarget(dom.playerChatToggleButton);

  if (visible) {
    dom.overlayMessages.scrollTop = dom.overlayMessages.scrollHeight;
  }
  syncUnreadBadgesWithVisibility();
  logEvent("ui", visible ? "Chat interno visible." : "Chat interno oculto.");
}

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
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
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  updateCollapseButton();
  syncUnreadBadgesWithVisibility();
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
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
  }
  if (icon) {
    icon.setAttribute("data-lucide", iconName);
    icon.innerHTML = "";
  }
  hydrateIcons();
}

// Layout del chat externo e interno: visibilidad, estilo, dock y collapse.
import { dom } from "../../core/dom.js";
import { configureExternalChatCollapseOperations, lockChatScrollSnapDuringProgrammaticScroll, setExternalChatCollapsed, forceExternalChatCollapsed, restoreExternalChatCollapsed, applyExternalChatCollapsed, captureExternalChatCollapseScroll } from "./chat-external-collapse.js";
export { setExternalChatCollapsed, forceExternalChatCollapsed, restoreExternalChatCollapsed } from "./chat-external-collapse.js";
import { configureChatDockController, setChatDock, getBottomDockVideoScrollTop } from "./dock/chat-dock-controller.js";
export { setChatDock } from "./dock/chat-dock-controller.js";
import { isMobilePortraitChatViewport, isMobileLandscapeRightDock, isMobileLandscapeFullscreenBottomDock, isMobilePortraitRightDock, isRightChatViewportOverlay } from "./dock/chat-layout-breakpoints.js";
import { syncInsideChatPanelOffset, syncExternalChatCollapseHandleOffset, updateCollapseButton } from "./dock/chat-collapse-handles.js";
export { syncInsideChatPanelOffset, syncExternalChatCollapseHandleOffset, updateCollapseButton } from "./dock/chat-collapse-handles.js";
import { configureChatVisibilityOperations, clearChatAutoCollapseTimer as clearAutoCollapseTimer, setInsideChatVisible, setInsideChatAutoExpandEnabled, setExternalChatAutoExpandEnabled, scheduleInsideChatAutoCollapse, scheduleExternalChatAutoCollapse, cancelExternalChatAutoCollapse, completeAutoOpenedChatResponse, syncChatAutoExpandControls } from "./dock/chat-visibility.js";
export { setInsideChatVisible, setInsideChatAutoExpandEnabled, setExternalChatAutoExpandEnabled, scheduleInsideChatAutoCollapse, scheduleExternalChatAutoCollapse, cancelExternalChatAutoCollapse, completeAutoOpenedChatResponse, syncChatAutoExpandControls } from "./dock/chat-visibility.js";
import { getVideoAreaRect, isStackedSessionLayout, wireResponsiveSessionLayout as wireResponsiveSessionLayoutModule } from "./dock/chat-responsive-layout.js";
import { isFullscreenPageActive, getPageScrollContainer, getPageScrollTop, getPageScrollMax, getElementPageTop, scrollPageTo } from "./dock/chat-page-scroll.js";
export { captureExternalChatCollapseScroll } from "./chat-external-collapse.js";
export { getVideoAreaRect, isStackedSessionLayout } from "./dock/chat-responsive-layout.js";
import { chatDockTransitionState } from "./dock/chat-layout-transition-state.js";
import { state, logEvent } from "../../core/state.js";
import { shouldAnchorChatCollapseHandleInHeader } from "./dock/chat-collapse-header-layout.js";
import { CHAT_DOCKS, CHAT_DOCK_META, withShortcutHint } from "../../core/utils.js";
import { hydrateIcons, hideTooltip, refreshTooltipForTarget } from "../icons-tooltips.js";
import { focusFullscreenWorkspace } from "../session/session-ui.js";
import {
  cancelIdentityEditing,
  syncNameInputWidth,
} from "../presence/index.js";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
  resetInsideUnread,
  resetPageUnread,
  syncUnreadBadgesWithVisibility,
} from "./messages/unread-counters.js";
import { scheduleMessageTimeAdjustment } from "./messages/message-time-layout.js";
import { focusChatInput } from "./composer/chat-input-focus.js";
import { restorePageScrollAfterRightChatCollapse } from "./dock/chat-scroll-preservation.js";
import {
  CHAT_DOCK_TRANSITIONS,
  resolveChatDockTransition,
} from "./dock/dock-transition-router.js";
import {
  preserveInsideChatPanelPlacementWhileClosing,
  syncInsideChatPanelPlacement,
  wireInsideChatPanelPlacement,
} from "../player/inside-chat-layout.js";
import { syncComponentAspectLayoutNow } from "./dock/component-aspect-layout.js";
import { configureChatDockTransitionOperations, animateFullscreenDockSwitch, animateRightToBottomWithNativeCollapse, animateFullscreenBottomToRightWithNativeCollapse, getBottomToRightScrollTop, animateRightToBottomSwitch, scheduleBottomToRightSwitch, clearBottomChatTransitionVisuals, lockBottomChatScrollAnchoring, restoreBottomChatScrollAnchoring, cancelBottomChatTransition, isDesktopBottomDock, completeDesktopBottomChatTransition, easeBottomChatCurtainProgress, setDesktopBottomChatCurtainProgress, getWorkspaceRowHeights, getWorkspaceContentHeight, setMobileBottomTransitionProgress, setDesktopBottomTransitionRowsProgress, completeMobileBottomChatTransition, stepMobileBottomChatTransition, stepDesktopBottomChatTransition, animateDesktopBottomChatCollapse, animateDesktopBottomChatExpand, animateBottomChatCollapse, animateBottomChatExpand } from "./dock/chat-dock-transitions.js";
import { CHAT_LAYOUT_SETTLE_MS, COLLAPSE_HANDLE_HIDE_MS, BOTTOM_DOCK_UNION_REVEAL_PX } from "./dock/chat-layout-timing.js";

const CHAT_STYLE_KEY = "cine-juntos-chat-style";

let layoutAdjustmentTimer = 0;
let collapseHandleOffsetTimer = 0;
let expandScrollTimer = 0;
let chatScrollSnapLockTimer = 0;
let externalChatVisualMotionTimer = 0;
let chatDockHandleSwitchTimer = 0;






// La grilla debe cambiar de una vez para evitar que el texto se reenvuelva en
// cada frame. Esta transición FLIP conserva el movimiento visual del video sin
// volver a calcular el contenido del chat ni los controles durante el trayecto.
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
    .map((button) => button.closest('.chat-area__collapse-hover-zone'))
    .filter(Boolean);

  if (state.chat.collapseHandleTransitionTimer) {
    window.clearTimeout(state.chat.collapseHandleTransitionTimer);
    state.chat.collapseHandleTransitionTimer = null;
  }

  collapseHandleButtons.forEach((button) => {
    button.classList.toggle('u-transitioning', isTransitioning);
  });
  collapseHandleZones.forEach((zone) => {
    zone.classList.toggle('u-transitioning', isTransitioning);
  });
  dom.sessionView?.classList.toggle('session-view--chat-layout-transitioning', isTransitioning);
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
    if (chatDockTransitionState.pendingChatDockSwitch || chatDockTransitionState.pendingBottomToRightSwitch) {
      state.chat.collapseHandleTransitionTimer = window.setTimeout(() => {
        if (chatDockTransitionState.pendingChatDockSwitch || chatDockTransitionState.pendingBottomToRightSwitch) {
          setCollapseHandleTransitioning(true, 80);
        } else {
          setCollapseHandleTransitioning(false);
        }
      }, 80);
      return;
    }

    collapseHandleButtons.forEach((button) => {
      button.classList.remove('u-transitioning');
    });
    collapseHandleZones.forEach((zone) => {
      zone.classList.remove('u-transitioning');
    });
    dom.sessionView?.classList.remove('session-view--chat-layout-transitioning');
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
  dom.sessionView.classList.add('session-view--chat-dock-handle-switching');
}

function scheduleChatDockHandlesReveal(delayMs) {
  if (!dom.sessionView) return;

  if (chatDockHandleSwitchTimer) {
    window.clearTimeout(chatDockHandleSwitchTimer);
  }
  chatDockHandleSwitchTimer = window.setTimeout(() => {
    chatDockHandleSwitchTimer = 0;
    dom.sessionView?.classList.remove('session-view--chat-dock-handle-switching');
  }, Math.max(0, delayMs));
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

export function getPersistedInsideChatStyle() {
  const savedStyle = localStorage.getItem(CHAT_STYLE_KEY);
  return ["float", "panel"].includes(savedStyle) ? savedStyle : "float";
}

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle(
      "chat-style-toggle__button--active",
      button.dataset.chatStyle === nextStyle,
    );
  });
  localStorage.setItem(CHAT_STYLE_KEY, nextStyle);
  scheduleMessageTimeAdjustmentAfterLayout();
  logEvent("ui", `Estilo de chat interno: ${nextStyle}.`);
}

export function wireResponsiveSessionLayout() {
  wireResponsiveSessionLayoutModule(syncExternalChatCollapseHandleOffset);
}

configureExternalChatCollapseOperations({
  setCollapseHandleTransitioning,
  scheduleExternalChatCollapseHandleOffset,
  scheduleMessageTimeAdjustmentAfterLayout,
  revealBottomDockUnion,
});

configureChatDockController({
  setCollapseHandleTransitioning,
  lockChatScrollSnapDuringProgrammaticScroll,
  revealBottomDockUnion,
  scheduleExternalChatCollapseHandleOffset,
});

configureChatVisibilityOperations({
  setExternalChatCollapsed,
  scheduleMessageTimeAdjustmentAfterLayout,
});

configureChatDockTransitionOperations({
  applyExternalChatCollapsed,
  getBottomDockChatScrollTop,
  keepChatDockHandlesHidden,
  lockChatScrollSnapDuringProgrammaticScroll,
  revealBottomDockUnion,
  scheduleChatDockHandlesReveal,
  scheduleExternalChatCollapseHandleOffset,
  scheduleMessageTimeAdjustmentAfterLayout,
  setCollapseHandleTransitioning,
  setExternalChatCollapsed,
  setChatDock,
});

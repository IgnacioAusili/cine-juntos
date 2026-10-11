import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { CHAT_DOCKS, CHAT_DOCK_META } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { cancelIdentityEditing, syncNameInputWidth } from "../presence.js?v=20261011-chat-ui-fixes-03";
import { focusFullscreenWorkspace } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { syncUnreadBadgesWithVisibility } from "./unread-counters.js?v=20261011-chat-interaction-fixes-01";
import { hydrateIcons } from "../icons-tooltips.js?v=20261011-chat-ui-fixes-03";
import { isFullscreenPageActive, getPageScrollMax, getElementPageTop, scrollPageTo } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { isMobilePortraitChatViewport } from "./chat-layout-breakpoints.js?v=20261011-chat-ui-fixes-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261011-chat-ui-fixes-02";
import { chatDockTransitionState } from "./chat-layout-transition-state.js?v=20261010-file-size-refactor-02";
import { updateCollapseButton } from "./chat-collapse-handles.js?v=20261011-chat-ui-fixes-03";
import { CHAT_DOCK_TRANSITIONS, resolveChatDockTransition } from "./dock-transition-router.js?v=20261010-file-size-refactor-02";
import { getBottomToRightScrollTop, animateFullscreenBottomToRightWithNativeCollapse, animateRightToBottomWithNativeCollapse, animateRightToBottomSwitch, animateFullscreenDockSwitch, scheduleBottomToRightSwitch } from "./chat-dock-transitions.js?v=20261011-chat-ui-fixes-02";

const controllerOperations = {};
export function configureChatDockController(operations) { Object.assign(controllerOperations, operations || {}); }
function getControllerOperations() {
  const required = ["setCollapseHandleTransitioning", "lockChatScrollSnapDuringProgrammaticScroll", "revealBottomDockUnion", "scheduleExternalChatCollapseHandleOffset"];
  if (required.some((key) => typeof controllerOperations[key] !== "function")) throw new Error("El controlador del dock requiere las operaciones del layout de chat.");
  return controllerOperations;
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

  if (!options.skipTransition && chatDockTransitionState.pendingChatDockSwitch) return;
  if (dispatchChatDockTransition(currentDock, nextDock, options, centeredVideoScrollTop)) return;

  // El paso al dock inferior no interpola la grilla, pero sí mueve el
  // viewport. Congelar las mediciones auxiliares evita lecturas de layout
  // mientras el navegador realiza ese desplazamiento suave.
  if (!options.skipTransition) {
    getControllerOperations().setCollapseHandleTransitioning(true);
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
  getControllerOperations().scheduleExternalChatCollapseHandleOffset();

  // Al hidratar la sala no debemos corregir el scroll que ya eligió el
  // navegador o el usuario. La revelación suave solo corresponde al cambio
  // manual hacia el dock inferior.
  if (
    nextDock === "bottom"
    && !options.preserveScroll
    && !dom.sessionView.classList.contains("chat-collapsed")
  ) {
    getControllerOperations().lockChatScrollSnapDuringProgrammaticScroll();
    window.requestAnimationFrame(() => getControllerOperations().revealBottomDockUnion());
  }

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen && !options.skipFullscreenFocus) {
    focusFullscreenWorkspace();
  }
}

export function getBottomDockVideoScrollTop() {
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

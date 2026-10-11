import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { cancelIdentityEditing } from "../presence.js?v=20261011-chat-ui-fixes-03";
import { focusFullscreenWorkspace } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { isMobileLandscapeRightDock, isMobileLandscapeFullscreenBottomDock, isRightChatViewportOverlay } from "./chat-layout-breakpoints.js?v=20261011-chat-ui-fixes-02";
import { getVideoAreaRect } from "./chat-responsive-layout.js?v=20261011-chat-ui-fixes-02";
import { isFullscreenPageActive, getPageScrollContainer, getPageScrollTop, getPageScrollMax, getElementPageTop, scrollPageTo } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { updateCollapseButton, syncExternalChatCollapseHandleOffset } from "./chat-collapse-handles.js?v=20261011-chat-ui-fixes-03";
import { clearChatAutoCollapseTimer as clearAutoCollapseTimer, scheduleExternalChatAutoCollapse } from "./chat-visibility.js?v=20261011-chat-ui-fixes-03";
import { restorePageScrollAfterRightChatCollapse } from "./chat-scroll-preservation.js?v=20261010-file-size-refactor-02";
import { syncUnreadBadgesWithVisibility } from "./unread-counters.js?v=20261011-chat-interaction-fixes-01";
import { getBottomDockVideoScrollTop } from "./chat-dock-controller.js?v=20261011-chat-ui-fixes-03";
import { animateExternalChatLayoutFrom } from "./chat-layout-visual-transition.js?v=20261011-chat-ui-fixes-02";
import { CHAT_LAYOUT_SETTLE_MS, COLLAPSE_HANDLE_HIDE_MS, RIGHT_CHAT_LAYOUT_TRANSITION_MS, RIGHT_CHAT_SCROLL_LOCK_MS, CHAT_SCROLL_SNAP_LOCK_MS } from "./chat-layout-timing.js?v=20261010-file-size-refactor-02";
import { clearBottomChatTransitionVisuals, cancelBottomChatTransition, isDesktopBottomDock, animateDesktopBottomChatCollapse, animateDesktopBottomChatExpand, animateBottomChatCollapse, animateBottomChatExpand } from "./chat-dock-transitions.js?v=20261011-chat-ui-fixes-02";

const EXTERNAL_CHAT_COLLAPSED_KEY = "cine-juntos-chat-collapsed";
let expandScrollTimer = 0;
let chatScrollSnapLockTimer = 0;
let pendingRightDockCollapseScrollTop = null;
const collapseOperations = {};
export function configureExternalChatCollapseOperations(operations) { Object.assign(collapseOperations, operations || {}); }
function getCollapseOperations() {
  const required = ["setCollapseHandleTransitioning", "scheduleExternalChatCollapseHandleOffset", "scheduleMessageTimeAdjustmentAfterLayout", "revealBottomDockUnion"];
  if (required.some((key) => typeof collapseOperations[key] !== "function")) throw new Error("El controlador de colapso necesita operaciones del layout de chat.");
  return collapseOperations;
}

export function lockChatScrollSnapDuringProgrammaticScroll(durationMs = CHAT_SCROLL_SNAP_LOCK_MS) {
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

export function captureExternalChatCollapseScroll() {
  pendingRightDockCollapseScrollTop =
    !dom.sessionView?.classList.contains("chat-collapsed") && isMobileLandscapeRightDock()
      ? getPageScrollTop()
      : null;
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

export function applyExternalChatCollapsed(collapsed) {
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
  getCollapseOperations().setCollapseHandleTransitioning(true, handleSettleDelay);
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
  getCollapseOperations().scheduleMessageTimeAdjustmentAfterLayout();
  getCollapseOperations().scheduleExternalChatCollapseHandleOffset();

  if (!collapsed && state.chat.autoOpenedExternal) scheduleExternalChatAutoCollapse();

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
          getCollapseOperations().revealBottomDockUnion();
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
  getCollapseOperations().scheduleExternalChatCollapseHandleOffset();
}

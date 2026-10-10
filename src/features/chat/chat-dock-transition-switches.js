import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { focusFullscreenWorkspace } from "../session-ui.js?v=20261010-file-size-refactor-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261010-file-size-refactor-02";
import { getElementPageTop, getPageScrollContainer, getPageScrollMax, getPageScrollTop, isFullscreenPageActive, scrollPageTo } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { syncComponentAspectLayoutNow } from "./component-aspect-layout.js?v=20261010-file-size-refactor-02";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js?v=20261010-file-size-refactor-02";
import { clearBottomChatTransitionVisuals, lockBottomChatScrollAnchoring, restoreBottomChatScrollAnchoring, cancelBottomChatTransition, completeDesktopBottomChatTransition, setDesktopBottomChatCurtainProgress, setMobileBottomTransitionProgress, setDesktopBottomTransitionRowsProgress, completeMobileBottomChatTransition, stepMobileBottomChatTransition, stepDesktopBottomChatTransition, animateDesktopBottomChatCollapse, animateDesktopBottomChatExpand, animateBottomChatCollapse, animateBottomChatExpand } from "./chat-dock-transition-core.js?v=20261010-file-size-refactor-02";
import { isDesktopBottomDock, easeBottomChatCurtainProgress, getWorkspaceRowHeights, getWorkspaceContentHeight } from "./chat-dock-transition-measurements.js?v=20261010-file-size-refactor-02";
import { BOTTOM_CHAT_CURTAIN_MS, BOTTOM_CHAT_SCROLL_TIMEOUT_MS, RIGHT_CHAT_LAYOUT_TRANSITION_MS, BOTTOM_TO_RIGHT_SCROLL_TIMEOUT_MS, BOTTOM_TO_RIGHT_LAYOUT_MS, FULLSCREEN_DOCK_OUT_MS, FULLSCREEN_DOCK_IN_MS } from "./chat-layout-timing.js?v=20261010-file-size-refactor-02";

export function animateFullscreenDockSwitch(nextDock) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
    return;
  }

  const transition = {
    nextDock,
    outTimerId: 0,
    inTimerId: 0,
  };
  chatDockTransitionState.pendingChatDockSwitch = transition;
  getChatDockOperations().keepChatDockHandlesHidden();
  getChatDockOperations().setCollapseHandleTransitioning(
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
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    sessionView.classList.add("chat-dock-mobile-transition-out-active");
    transition.outTimerId = window.setTimeout(() => {
      if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;

      sessionView.classList.remove(
        "chat-dock-mobile-transition-out",
        "chat-dock-mobile-transition-out-active",
      );
      getChatDockOperations().setChatDock(nextDock, {
        skipTransition: true,
        preserveScroll: true,
        skipFullscreenFocus: true,
      });
      // En PC el dock inferior tiene una cortina propia que también se usa
      // fuera de fullscreen. Reutilizarla acá mantiene el mismo despliegue y
      // hace que el scroll acompañe al panel hasta la unión inferior.
      if (nextDock === "bottom" && isDesktopBottomDock()) {
        chatDockTransitionState.pendingChatDockSwitch = null;
        animateDesktopBottomChatExpand();
        getChatDockOperations().scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
        return;
      }
      if (nextDock === "bottom") {
        getChatDockOperations().revealBottomDockUnion("auto");
      } else {
        focusFullscreenWorkspace();
      }
      sessionView.classList.add("chat-dock-mobile-transition-in");
      void chatArea.offsetWidth;
      window.requestAnimationFrame(() => {
        if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
        sessionView.classList.add("chat-dock-mobile-transition-in-active");
        transition.inTimerId = window.setTimeout(() => {
          if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
          chatDockTransitionState.pendingChatDockSwitch = null;
          getChatDockOperations().scheduleChatDockHandlesReveal(FULLSCREEN_DOCK_IN_MS + 80);
          sessionView.classList.remove(
            "chat-dock-mobile-transition-in",
            "chat-dock-mobile-transition-in-active",
          );
          getChatDockOperations().setCollapseHandleTransitioning(false);
          getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
          getChatDockOperations().scheduleMessageTimeAdjustmentAfterLayout();
    }, FULLSCREEN_DOCK_IN_MS);
      });
    }, FULLSCREEN_DOCK_OUT_MS);
  });
}

export function animateRightToBottomWithNativeCollapse() {
  const transition = {
    switchTimerId: 0,
  };
  chatDockTransitionState.pendingChatDockSwitch = transition;
  getChatDockOperations().keepChatDockHandlesHidden();

  // Es el mismo cambio que ejecuta el botón "Contraer chat". Al terminar la
  // reducción lateral se monta el dock inferior todavía contraído y se deja
  // que getChatDockOperations().setExternalChatCollapsed(false) ejecute su expansión natural.
  getChatDockOperations().setExternalChatCollapsed(true, { source: "dock-switch" });
  transition.switchTimerId = window.setTimeout(() => {
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    chatDockTransitionState.pendingChatDockSwitch = null;
    getChatDockOperations().setChatDock("bottom", {
      skipTransition: true,
      preserveScroll: true,
      skipFullscreenFocus: true,
    });
    // Medir la geometría inferior mientras sigue contraído; al abrirlo después,
    // el primer frame ya reserva una fila completa para el reproductor y otra
    // para el chat.
    syncComponentAspectLayoutNow({ allowDuringChatTransition: true });
    getChatDockOperations().setExternalChatCollapsed(false, { source: "dock-switch" });
    getChatDockOperations().scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
  }, RIGHT_CHAT_LAYOUT_TRANSITION_MS + 40);
}

export function animateFullscreenBottomToRightWithNativeCollapse() {
  const transition = {
    switchTimerId: 0,
  };
  chatDockTransitionState.pendingChatDockSwitch = transition;
  getChatDockOperations().keepChatDockHandlesHidden();

  // Primero se ejecuta la cortina natural del dock inferior. El dock lateral
  // se monta recién cuando el video ya recuperó su posición y luego se abre
  // con la transición natural de expansión del panel.
  getChatDockOperations().setExternalChatCollapsed(true, { source: "dock-switch" });
  transition.switchTimerId = window.setTimeout(() => {
    if (chatDockTransitionState.pendingChatDockSwitch !== transition) return;
    chatDockTransitionState.pendingChatDockSwitch = null;
    getChatDockOperations().setChatDock("right", {
      skipTransition: true,
      preserveScroll: true,
      skipFullscreenFocus: true,
    });
    getChatDockOperations().setExternalChatCollapsed(false, { source: "dock-switch" });
    getChatDockOperations().scheduleChatDockHandlesReveal(RIGHT_CHAT_LAYOUT_TRANSITION_MS + 80);
  }, BOTTOM_CHAT_CURTAIN_MS + 40);
}

export function getBottomToRightScrollTop() {
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

export function animateRightToBottomSwitch(nextDock) {
  if (!dom.sessionView || !dom.workspace || !dom.chatArea) {
    getChatDockOperations().setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
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
  chatDockTransitionState.bottomChatTransition = transition;
  getChatDockOperations().keepChatDockHandlesHidden();
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );

  // Cambiar el dock sin revelar el chat todavía permite que el mismo motor de
  // la cortina inferior controle las filas y el recorte, sin un frame visible
  // en el que aparezcan ambos chats.
  getChatDockOperations().setChatDock(nextDock, { skipTransition: true, preserveScroll: true });
  dom.sessionView.classList.add("chat-bottom-mobile-expand-visual");
  transition.targetRows = getWorkspaceRowHeights();
  transition.targetScrollTop = getChatDockOperations().getBottomDockChatScrollTop();
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
    getChatDockOperations().scheduleChatDockHandlesReveal(BOTTOM_CHAT_CURTAIN_MS + 80);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function scheduleBottomToRightSwitch(nextDock, targetScrollTop) {
  if (chatDockTransitionState.pendingBottomToRightSwitch) return;

  const transition = {
    frameId: 0,
    timeoutId: 0,
  };
  chatDockTransitionState.pendingBottomToRightSwitch = transition;
  getChatDockOperations().keepChatDockHandlesHidden();

  const needsScroll = Math.abs(getPageScrollTop() - targetScrollTop) > 2;
  if (needsScroll) {
    getChatDockOperations().lockChatScrollSnapDuringProgrammaticScroll();
    scrollPageTo(targetScrollTop, "smooth");
  }

  const finish = () => {
    if (chatDockTransitionState.pendingBottomToRightSwitch !== transition) return;
    chatDockTransitionState.pendingBottomToRightSwitch = null;
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
    getChatDockOperations().setCollapseHandleTransitioning(true, switchDuration);
    dom.sessionView.classList.add("chat-dock-switching");
    window.requestAnimationFrame(() => {
      getChatDockOperations().setChatDock(nextDock, {
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
        getChatDockOperations().scheduleChatDockHandlesReveal(switchDuration + 80);
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

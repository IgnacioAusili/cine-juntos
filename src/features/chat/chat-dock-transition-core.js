import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261010-file-size-refactor-02";
import { getElementPageTop, getPageScrollContainer, getPageScrollMax, getPageScrollTop, isFullscreenPageActive, scrollPageTo } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { chatDockTransitionState, getChatDockOperations } from "./chat-layout-transition-state.js?v=20261010-file-size-refactor-02";
import { easeBottomChatCurtainProgress, getWorkspaceRowHeights, getWorkspaceContentHeight, isDesktopBottomDock } from "./chat-dock-transition-measurements.js?v=20261010-file-size-refactor-02";
import { BOTTOM_CHAT_CURTAIN_MS, BOTTOM_CHAT_SCROLL_TIMEOUT_MS } from "./chat-layout-timing.js?v=20261010-file-size-refactor-02";

export function clearBottomChatTransitionVisuals() {
  dom.sessionView?.classList.remove(
    "chat-bottom-collapse-visual",
    "chat-bottom-expand-visual",
    "chat-bottom-mobile-collapse-visual",
    "chat-bottom-mobile-expand-visual",
    "chat-bottom-mobile-curtain-active",
    "chat-bottom-pc-collapse-visual",
    "chat-bottom-pc-expand-visual",
    "chat-bottom-pc-collapse-controls-transition",
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

export function lockBottomChatScrollAnchoring(transition) {
  const scrollContainer = isFullscreenPageActive()
    ? getPageScrollContainer()
    : document.scrollingElement || document.documentElement;
  if (!scrollContainer?.style) return;

  transition.scrollAnchorContainer = scrollContainer;
  transition.previousScrollAnchor = scrollContainer.style.getPropertyValue("overflow-anchor");
  transition.previousScrollAnchorPriority = scrollContainer.style.getPropertyPriority("overflow-anchor");
  scrollContainer.style.setProperty("overflow-anchor", "none");
}

export function restoreBottomChatScrollAnchoring(transition) {
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

export function cancelBottomChatTransition() {
  if (chatDockTransitionState.bottomChatTransition) {
    window.cancelAnimationFrame(chatDockTransitionState.bottomChatTransition.frameId);
    window.clearTimeout(chatDockTransitionState.bottomChatTransition.timeoutId);
    restoreBottomChatScrollAnchoring(chatDockTransitionState.bottomChatTransition);
    chatDockTransitionState.bottomChatTransition = null;
  }
  clearBottomChatTransitionVisuals();
}

export function completeDesktopBottomChatTransition(transition) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  chatDockTransitionState.bottomChatTransition = null;
  getChatDockOperations().setCollapseHandleTransitioning(false);
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
  clearBottomChatTransitionVisuals();
}

export function setDesktopBottomChatCurtainProgress(progress) {
  const clip = Math.max(0, Math.min(100, progress));
  dom.sessionView?.style.setProperty("--chat-bottom-curtain-clip", `${clip}%`);
}

export function setMobileBottomTransitionProgress(transition, progress) {
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

export function setDesktopBottomTransitionRowsProgress(transition, progress) {
  if (!transition.animateRows || !dom.workspace) return;

  const easedProgress = easeBottomChatCurtainProgress(progress);
  const videoHeight = transition.startRows[0]
    + ((transition.targetRows[0] - transition.startRows[0]) * easedProgress);
  const chatHeight = transition.startRows[1]
    + ((transition.targetRows[1] - transition.startRows[1]) * easedProgress);
  dom.workspace.style.setProperty(
    "grid-template-rows",
    `${Math.max(0, videoHeight)}px ${Math.max(0, chatHeight)}px`,
  );
}

export function completeMobileBottomChatTransition(transition) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

  window.cancelAnimationFrame(transition.frameId);
  window.clearTimeout(transition.timeoutId);
  restoreBottomChatScrollAnchoring(transition);
  chatDockTransitionState.bottomChatTransition = null;
  getChatDockOperations().setCollapseHandleTransitioning(false);
  getChatDockOperations().scheduleExternalChatCollapseHandleOffset();
  clearBottomChatTransitionVisuals();
}

export function stepMobileBottomChatTransition(transition, force = false) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

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

export function stepDesktopBottomChatTransition(transition, force = false) {
  if (chatDockTransitionState.bottomChatTransition !== transition) return;

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
  setDesktopBottomTransitionRowsProgress(transition, progress);

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
    getChatDockOperations().applyExternalChatCollapsed(true);
    getChatDockOperations().setCollapseHandleTransitioning(
      true,
      BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
    );
    scrollPageTo(transition.targetScrollTop, "auto");
  }
  completeDesktopBottomChatTransition(transition);
}

export function animateDesktopBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(true);
    return;
  }

  const animateRows = dom.sessionView.classList.contains("bottom-dock-panels-fit-viewport");
  const startRows = animateRows ? getWorkspaceRowHeights() : [0, 0];
  const transition = {
    collapsed: true,
    animateRows,
    frameId: 0,
    timeoutId: 0,
    startedAt: performance.now(),
    startRows,
    targetRows: animateRows ? [getWorkspaceContentHeight(), 0] : [0, 0],
    startScrollTop: getPageScrollTop(),
    targetScrollTop,
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add("chat-bottom-pc-collapse-visual");
  setDesktopBottomChatCurtainProgress(0);
  if (transition.animateRows) {
    // Reanclar los controles al video desde el primer frame; si se espera a
    // que termine la medición del layout, cambian de posición al final.
    dom.sessionView.classList.add("chat-bottom-pc-collapse-controls-transition");
    dom.workspace.style.setProperty(
      "grid-template-rows",
      `${transition.startRows[0]}px ${transition.startRows[1]}px`,
    );
  }
  void dom.chatArea.offsetWidth;
  transition.frameId = window.requestAnimationFrame(() => {
    if (chatDockTransitionState.bottomChatTransition !== transition) return;
    stepDesktopBottomChatTransition(transition);
  });
  transition.timeoutId = window.setTimeout(() => {
    stepDesktopBottomChatTransition(transition, true);
  }, BOTTOM_CHAT_CURTAIN_MS + 80);
}

export function animateDesktopBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(false);
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
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  setDesktopBottomChatCurtainProgress(100);
  // Se reserva la fila completa con la cortina cerrada. Desde el primer frame
  // el scroll y la apertura recorren juntos la distancia hasta la unión.
  getChatDockOperations().applyExternalChatCollapsed(false);
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
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  transition.targetScrollTop = getChatDockOperations().getBottomDockChatScrollTop();
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

export function animateBottomChatCollapse(targetScrollTop) {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(true);
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
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  getChatDockOperations().setCollapseHandleTransitioning(
    true,
    BOTTOM_CHAT_CURTAIN_MS + BOTTOM_CHAT_SCROLL_TIMEOUT_MS + 80,
  );
  dom.sessionView.classList.add("chat-bottom-mobile-collapse-visual");
  void dom.workspace?.offsetWidth;
  getChatDockOperations().applyExternalChatCollapsed(true);
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

export function animateBottomChatExpand() {
  if (!dom.sessionView || !dom.chatArea) {
    getChatDockOperations().applyExternalChatCollapsed(false);
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
    targetScrollTop: getChatDockOperations().getBottomDockChatScrollTop(),
  };
  chatDockTransitionState.bottomChatTransition = transition;
  lockBottomChatScrollAnchoring(transition);
  dom.sessionView.classList.add("chat-bottom-mobile-expand-visual");
  void dom.workspace?.offsetWidth;
  // Primero se reserva la fila completa con el contenido todavía oculto;
  // después se revela desde la unión superior hacia abajo.
  getChatDockOperations().applyExternalChatCollapsed(false);
  transition.targetRows = getWorkspaceRowHeights();
  getChatDockOperations().setCollapseHandleTransitioning(
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

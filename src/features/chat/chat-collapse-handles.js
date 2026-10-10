import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { hydrateIcons, hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { shouldAnchorChatCollapseHandleInHeader } from "./chat-collapse-header-layout.js?v=20261010-file-size-refactor-02";
import { isFullscreenPageActive } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261010-file-size-refactor-02";
import { isMobilePortraitChatViewport } from "./chat-layout-breakpoints.js?v=20261010-file-size-refactor-02";

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

  if (dom.sessionView.dataset.chatDock === "bottom") {
    dom.sessionView.classList.remove("chat-collapse-in-header");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-top");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-left");
    dom.sessionView.style.removeProperty("--chat-right-collapse-handle-size");
  }

  if ((dom.sessionView.dataset.chatDock || "right") !== "bottom") {
    const isRightDock = dom.sessionView.dataset.chatDock === "right";
    const isExpanded = !dom.sessionView.classList.contains("chat-collapsed");
    const chatHeader = dom.chatArea.querySelector(".chat-tools");
    const chatRect = dom.chatArea.getBoundingClientRect();
    const isHeaderAnchoredLayout = Boolean(
      isRightDock
        && isExpanded
        && shouldAnchorChatCollapseHandleInHeader({
          workspace: dom.workspace,
          chatArea: dom.chatArea,
          chatHeader,
          isStacked: isStackedSessionLayout(),
        }),
    );
    dom.sessionView.classList.toggle("chat-collapse-in-header", isHeaderAnchoredLayout);
    if (isHeaderAnchoredLayout) {
      const headerRect = chatHeader.getBoundingClientRect();
      const chatStyles = getComputedStyle(dom.chatArea);
      const headerStyles = getComputedStyle(chatHeader);
      const chatBorderTop = Number.parseFloat(chatStyles.borderTopWidth) || 0;
      const chatBorderLeft = Number.parseFloat(chatStyles.borderLeftWidth) || 0;
      const firstLeadingControl = chatHeader.querySelector(".chat-tools-leading > *");
      const firstHeaderControlRect = firstLeadingControl?.getBoundingClientRect();
      const iconAnchor = dom.collapseChatButton?.querySelector(".chat-collapse-icon-anchor");
      const iconAnchorRect = iconAnchor?.getBoundingClientRect();
      const iconAnchorSize =
        iconAnchorRect?.width
        || Number.parseFloat(iconAnchor ? getComputedStyle(iconAnchor).width : "")
        || 28;
      const headerInlineStartPadding = Number.parseFloat(headerStyles.paddingInlineStart) || 0;
      const leadingSpace = firstHeaderControlRect?.width > 0
        ? Math.max(0, firstHeaderControlRect.left - headerRect.left)
        : headerInlineStartPadding || iconAnchorSize;
      const handleLeft =
        headerRect.left - chatRect.left - chatBorderLeft
        + Math.max(0, (leadingSpace - iconAnchorSize) / 2);
      const handleTop = Math.max(
        0,
        headerRect.top - chatRect.top - chatBorderTop + headerRect.height / 2,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-left",
        `${handleLeft}px`,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-size",
        `${iconAnchorSize}px`,
      );
      dom.sessionView.style.setProperty(
        "--chat-right-collapse-handle-top",
        `${handleTop}px`,
      );
    } else {
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-top");
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-left");
      dom.sessionView.style.removeProperty("--chat-right-collapse-handle-size");
    }

    const isMobileRightDock =
      isRightDock
      && isStackedSessionLayout();
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
  const isLandscapeMobileFullscreenBottomDock =
    isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
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
  const collapseHandleHeight = dom.collapseChatButton?.getBoundingClientRect().height || 32;
  const isFullscreenBottomChatBelowViewport =
    isLandscapeMobileFullscreenBottomDock
    && chatRect.top >= window.innerHeight - 1;
  // La zona de la flecha vive dentro de .chat-area, por lo que su offset
  // vertical debe ser relativo al panel y no al workspace completo. Usar el
  // workspace aquí la deja fuera del header en el dock inferior de escritorio.
  const chatHeaderStyles = chatHeader ? getComputedStyle(chatHeader) : null;
  const headerPaddingTop = Number.parseFloat(chatHeaderStyles?.paddingTop || "0") || 0;
  const headerPaddingBottom = Number.parseFloat(chatHeaderStyles?.paddingBottom || "0") || 0;
  // Con padding vertical asimétrico, el centro geométrico del header no
  // coincide con el centro visual de su contenido. La corrección se deriva
  // de esos paddings para no fijar un desplazamiento en píxeles.
  const headerContentCenterCorrection = (headerPaddingTop - headerPaddingBottom) / 2;
  const handleTop = isFullscreenBottomChatBelowViewport
    ? playerControlBarRect
      ? Math.max(0, Math.round(playerControlBarRect.top - workspaceRect.top - 36))
      : Math.max(0, Math.round(chatRect.top - workspaceRect.top - collapseHandleHeight / 2))
    : chatHeaderRect && !isPortraitMobileBottomDock
      ? Math.max(
        0,
        Math.round(
          chatHeaderRect.top
          - chatRect.top
          + chatHeaderRect.height / 2
          - headerContentCenterCorrection,
        ),
      )
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

export function updateCollapseButton() {
  // Cada estado tiene su propio botón y anclaje. Solo cambia la visibilidad
  // semántica y el icono de cada acción; ningún nodo se reposiciona entre
  // contraer y expandir.
  hideTooltip(true);
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const isPortraitMobileRightDock =
    dock === "right"
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: portrait)").matches;
  const isFullscreenLandscapeBottomDock =
    dock === "bottom"
    && isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
  const isDesktopLayout = !isStackedSessionLayout();
  const iconName = isFullscreenLandscapeBottomDock
    ? collapsed
      ? "arrow-up"
      : "arrow-down"
    : isDesktopLayout
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

  const controls = [
    { button: dom.collapseChatButton, isCollapsedState: false },
    { button: dom.expandChatButton, isCollapsedState: true },
  ];
  controls.forEach(({ button, isCollapsedState }) => {
    if (!button) return;
    const label = isCollapsedState ? "Expandir chat" : "Contraer chat";
    const controlIconName = isCollapsedState === collapsed
      ? iconName
      : isFullscreenLandscapeBottomDock
        ? isCollapsedState ? "arrow-up" : "arrow-down"
        : iconName;
    const iconAnchor = button.querySelector(".chat-collapse-icon-anchor");
    const icon = iconAnchor?.querySelector("[data-lucide]");
    button.dataset.tooltip = label;
    button.removeAttribute("title");
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-hidden", String(isCollapsedState !== collapsed));
    // Las flechas cambian de anclaje mientras el panel se anima. El tooltip
    // no debe volver a programarse sobre el control que queda bajo el puntero.
    iconAnchor?.removeAttribute("data-tooltip");
    button.setAttribute("tabindex", "-1");
    button.blur();
    if (icon) {
      icon.setAttribute("data-lucide", controlIconName);
      icon.innerHTML = "";
    }
  });
  hydrateIcons();
}

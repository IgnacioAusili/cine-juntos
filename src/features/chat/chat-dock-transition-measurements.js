import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261011-chat-ui-fixes-02";

export function isDesktopBottomDock() {
  const isLandscapeMobile = isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
  return dom.sessionView?.dataset.chatDock === "bottom"
    && (!isStackedSessionLayout() || isLandscapeMobile);
}

export function easeBottomChatCurtainProgress(progress) {
  // Curva de salida equivalente a la que usa la cortina lateral:
  // arranca decidida y desacelera al llegar al borde final.
  return 1 - ((1 - progress) ** 3);
}

export function getWorkspaceRowHeights() {
  if (!dom.workspace) return [0, 0];

  const rows = getComputedStyle(dom.workspace)
    .gridTemplateRows
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value));
  return [
    Number.isFinite(rows[0]) ? rows[0] : 0,
    Number.isFinite(rows[1]) ? rows[1] : 0,
  ];
}

export function getWorkspaceContentHeight() {
  if (!dom.workspace) return 0;

  const styles = getComputedStyle(dom.workspace);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, dom.workspace.clientHeight - paddingTop - paddingBottom);
}

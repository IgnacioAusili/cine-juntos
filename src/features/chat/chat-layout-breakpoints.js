import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { isFullscreenPageActive } from "./chat-page-scroll.js?v=20261010-file-size-refactor-02";
import { isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261011-chat-ui-fixes-02";

export function isMobilePortraitChatViewport() {
  return window.matchMedia("(max-width: 680px) and (orientation: portrait)").matches;
}

export function isMobileLandscapeRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
}

export function isMobileLandscapeFullscreenBottomDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "bottom"
    && isFullscreenPageActive()
    && isStackedSessionLayout()
    && window.matchMedia("(orientation: landscape)").matches;
}

export function isMobilePortraitRightDock() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && isMobilePortraitChatViewport();
}

export function isRightChatViewportOverlay() {
  return (dom.sessionView?.dataset.chatDock || "right") === "right"
    && window.matchMedia("(max-width: 680px)").matches;
}

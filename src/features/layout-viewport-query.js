import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";

const MOBILE_LAYOUT_QUERY = "(max-width: 980px)";

export function isMobileLayout() {
  return window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches === true;
}

export function isFullscreenActive() {
  return Boolean(document.fullscreenElement)
    || document.body.classList.contains("fullscreen-mode");
}

function isOverlayChatInput(target) {
  return target?.id === "overlayMessageInput"
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

export function isOverlayChatInputFocused() {
  return isOverlayChatInput(document.activeElement);
}

export function isBottomChatKeyboardTarget(target) {
  return (target === dom.messageInput || target === dom.nameInput)
    && dom.sessionView?.dataset.chatDock === "bottom";
}

export function isBottomChatNameEditorFocused() {
  return Boolean(
    dom.nameInput
      && dom.chatNameField?.dataset.editing === "true"
      && document.activeElement === dom.nameInput,
  );
}

export function isBottomChatInputFocused() {
  return isBottomChatKeyboardTarget(document.activeElement);
}

export function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains("bottom-chat-keyboard-open");
}

export function isRightChatInputFocused() {
  return document.activeElement === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "right";
}

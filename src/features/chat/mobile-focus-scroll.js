import { dom } from "../../core/dom.js";

let lockedPageScrollTop = 0;
let lockedScrollContainer = null;
let lockedScrollContainerTop = 0;
let pointerDownInput = null;
let hasFocusScrollPosition = false;
let focusRestoreFrame = 0;
let focusRestoreDeadline = 0;

function isFullscreenActive() {
  return Boolean(document.fullscreenElement)
    || document.body.classList.contains("fullscreen-mode");
}

function getScrollContainer() {
  if (!isFullscreenActive()) return null;
  return dom.sessionView?.closest(".app-shell") || null;
}

function isAnyChatInputFocused() {
  return dom.messageInput === document.activeElement
    || isOverlayChatInput(document.activeElement);
}

export function isOverlayChatInput(target) {
  return target === dom.overlayMessageInput
    || target?.matches?.('[data-proxy-for="overlayMessageInput"]');
}

export function isChatTextInput(target) {
  return target === dom.messageInput || isOverlayChatInput(target);
}

export function capturePageScrollPosition() {
  lockedPageScrollTop = Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0);
  lockedScrollContainer = getScrollContainer();
  lockedScrollContainerTop = Math.round(lockedScrollContainer?.scrollTop || 0);
  hasFocusScrollPosition = true;
}

export function captureFocusScrollPositionIfNeeded() {
  if (!hasFocusScrollPosition) capturePageScrollPosition();
}

export function handleChatPointerDown(target) {
  if (!isChatTextInput(target)) return;
  pointerDownInput = target;
  capturePageScrollPosition();
}

export function consumePointerFocus(target) {
  const wasPointerFocused = pointerDownInput === target;
  pointerDownInput = null;
  return wasPointerFocused;
}

export function keepPageScrollLocked(keyboardWasOpen, overlayInputFocused) {
  if (!keyboardWasOpen && !overlayInputFocused) return;
  const currentScrollTop = Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0);
  if (currentScrollTop !== lockedPageScrollTop) {
    window.scrollTo({ top: lockedPageScrollTop, behavior: "auto" });
  }

  const currentContainer = getScrollContainer();
  if (
    currentContainer
    && currentContainer === lockedScrollContainer
    && Math.round(currentContainer.scrollTop || 0) !== lockedScrollContainerTop
  ) {
    currentContainer.scrollTo({ top: lockedScrollContainerTop, behavior: "auto" });
  }
}

export function scheduleFocusScrollRestore() {
  if (focusRestoreFrame) return;

  focusRestoreDeadline = performance.now() + 450;
  const restore = () => {
    focusRestoreFrame = 0;
    if (isAnyChatInputFocused()) return;

    if (Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0) !== lockedPageScrollTop) {
      window.scrollTo({ top: lockedPageScrollTop, behavior: "auto" });
    }

    if (
      lockedScrollContainer
      && Math.round(lockedScrollContainer.scrollTop || 0) !== lockedScrollContainerTop
    ) {
      lockedScrollContainer.scrollTo({ top: lockedScrollContainerTop, behavior: "auto" });
    }

    if (performance.now() < focusRestoreDeadline) {
      focusRestoreFrame = window.requestAnimationFrame(restore);
      return;
    }

    pointerDownInput = null;
    hasFocusScrollPosition = false;
  };

  focusRestoreFrame = window.requestAnimationFrame(restore);
}

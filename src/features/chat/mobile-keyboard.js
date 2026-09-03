import { dom } from "../../core/dom.js";
import { wireChatInputCorrections } from "./chat-input-focus.js";
import {
  captureFocusScrollPositionIfNeeded,
  capturePageScrollPosition,
  consumePointerFocus,
  handleChatPointerDown,
  isOverlayChatInput,
  keepPageScrollLocked,
  scheduleFocusScrollRestore,
} from "./mobile-focus-scroll.js?v=20260903-iphone-chat-focus-02";

const MOBILE_WIDTH_QUERY = "(max-width: 980px)";
const KEYBOARD_REDUCTION_PX = 80;
const TEXT_INPUTS = new Set();

let baselineHeight = 0;
let baselineWidth = 0;
let syncFrameId = 0;
let keyboardWasOpen = false;
let overlayInputFocused = false;

function getViewportWidth() {
  return Math.round(
    window.visualViewport?.width
      || window.innerWidth
      || document.documentElement.clientWidth
      || 0,
  );
}

function getViewportHeight() {
  return Math.round(
    window.visualViewport?.height
      || window.innerHeight
      || document.documentElement.clientHeight
      || 0,
  );
}

function isMobileLayout() {
  return window.matchMedia(MOBILE_WIDTH_QUERY).matches;
}

function isChatInputFocused() {
  return TEXT_INPUTS.has(document.activeElement);
}

function setKeyboardState(isOpen) {
  if (!dom.sessionView) return;
  dom.sessionView.classList.toggle("chat-keyboard-open", isOpen);
  const rootStyle = document.documentElement.style;
  if (isOpen) {
    rootStyle.setProperty("--mobile-keyboard-layout-height", `${baselineHeight}px`);
    rootStyle.setProperty(
      "--mobile-keyboard-inset",
      `${Math.max(0, baselineHeight - getViewportHeight())}px`,
    );
  } else {
    rootStyle.setProperty("--mobile-keyboard-layout-height", `${getViewportHeight()}px`);
    rootStyle.setProperty("--mobile-keyboard-inset", "0px");
  }
}

function syncKeyboardState() {
  syncFrameId = 0;
  const currentWidth = getViewportWidth();
  const currentHeight = getViewportHeight();
  const focused = isChatInputFocused();
  const orientationChanged = baselineWidth && currentWidth !== baselineWidth;

  if (!baselineHeight || orientationChanged || currentHeight > baselineHeight) {
    baselineHeight = currentHeight;
    baselineWidth = currentWidth;
  } else if (currentHeight >= baselineHeight - KEYBOARD_REDUCTION_PX) {
    baselineHeight = currentHeight;
    baselineWidth = currentWidth;
  }

  const isKeyboardOpen = isMobileLayout()
    && focused
    && baselineHeight - currentHeight >= KEYBOARD_REDUCTION_PX;
  if (isKeyboardOpen && !keyboardWasOpen) {
    // En iOS el scroll automático ocurre antes de focusin. Si el toque ya
    // capturó la posición, no la reemplaces por la posición desplazada.
    captureFocusScrollPositionIfNeeded();
  }
  keyboardWasOpen = isKeyboardOpen;
  setKeyboardState(isKeyboardOpen);
  keepPageScrollLocked(keyboardWasOpen, overlayInputFocused);
}

function scheduleKeyboardSync() {
  if (syncFrameId) return;
  syncFrameId = window.requestAnimationFrame(syncKeyboardState);
}

function lockPageScroll() {
  keepPageScrollLocked(keyboardWasOpen, overlayInputFocused);
}

function handleFocusIn(event) {
  const wasPointerFocused = consumePointerFocus(event.target);

  if (isOverlayChatInput(event.target)) {
    overlayInputFocused = true;
    if (!wasPointerFocused) capturePageScrollPosition();
    scheduleKeyboardSync();
    return;
  }
  if (!TEXT_INPUTS.has(event.target)) return;
  if (!wasPointerFocused) capturePageScrollPosition();
  scheduleKeyboardSync();
}

function handleFocusOut(event) {
  if (isOverlayChatInput(event.target)) {
    overlayInputFocused = false;
    scheduleFocusScrollRestore();
    scheduleKeyboardSync();
    return;
  }
  if (!TEXT_INPUTS.has(event.target)) return;
  setKeyboardState(false);
  scheduleFocusScrollRestore();
  scheduleKeyboardSync();
}

export function wireMobileKeyboardLayout() {
  if (!dom.sessionView) return;

  const chatInputs = [dom.messageInput, dom.overlayMessageInput];
  wireChatInputCorrections(chatInputs);
  if (dom.messageInput) TEXT_INPUTS.add(dom.messageInput);
  baselineHeight = getViewportHeight();
  baselineWidth = getViewportWidth();

  document.addEventListener("pointerdown", (event) => handleChatPointerDown(event.target), {
    capture: true,
    passive: true,
  });
  document.addEventListener("focusin", handleFocusIn, { passive: true });
  document.addEventListener("focusout", handleFocusOut, { passive: true });
  window.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.addEventListener("scroll", lockPageScroll, { passive: true });
  document.addEventListener("scroll", lockPageScroll, {
    capture: true,
    passive: true,
  });
  window.addEventListener("orientationchange", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleKeyboardSync, { passive: true });
  scheduleKeyboardSync();
}

import { dom } from "../../core/dom.js";

const MOBILE_WIDTH_QUERY = "(max-width: 980px)";
const KEYBOARD_REDUCTION_PX = 80;
const TEXT_INPUTS = new Set();

let baselineHeight = 0;
let baselineWidth = 0;
let syncFrameId = 0;

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
  setKeyboardState(isKeyboardOpen);
}

function scheduleKeyboardSync() {
  if (syncFrameId) return;
  syncFrameId = window.requestAnimationFrame(syncKeyboardState);
}

function handleFocusIn(event) {
  if (!TEXT_INPUTS.has(event.target)) return;
  scheduleKeyboardSync();
}

function handleFocusOut(event) {
  if (!TEXT_INPUTS.has(event.target)) return;
  setKeyboardState(false);
  scheduleKeyboardSync();
}

export function wireMobileKeyboardLayout() {
  if (!dom.sessionView) return;

  [dom.messageInput, dom.overlayMessageInput].forEach((input) => {
    if (input) TEXT_INPUTS.add(input);
  });
  baselineHeight = getViewportHeight();
  baselineWidth = getViewportWidth();

  document.addEventListener("focusin", handleFocusIn, { passive: true });
  document.addEventListener("focusout", handleFocusOut, { passive: true });
  window.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.addEventListener("orientationchange", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleKeyboardSync, { passive: true });
  scheduleKeyboardSync();
}

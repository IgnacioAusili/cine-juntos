import { dom } from "../../core/dom.js";
import { wireChatInputCorrections } from "./chat-input-focus.js";

const MOBILE_WIDTH_QUERY = "(max-width: 980px)";
const KEYBOARD_REDUCTION_PX = 80;
const TEXT_INPUTS = new Set();

let baselineHeight = 0;
let baselineWidth = 0;
let syncFrameId = 0;
let lockedPageScrollTop = 0;
let keyboardWasOpen = false;

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

function keepPageScrollLocked() {
  if (!keyboardWasOpen) return;
  const currentScrollTop = Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0);
  if (currentScrollTop === lockedPageScrollTop) return;
  window.scrollTo({ top: lockedPageScrollTop, behavior: "auto" });
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
    lockedPageScrollTop = Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0);
  }
  keyboardWasOpen = isKeyboardOpen;
  setKeyboardState(isKeyboardOpen);
  keepPageScrollLocked();
}

function scheduleKeyboardSync() {
  if (syncFrameId) return;
  syncFrameId = window.requestAnimationFrame(syncKeyboardState);
}

function handleFocusIn(event) {
  if (!TEXT_INPUTS.has(event.target)) return;
  lockedPageScrollTop = Math.round(window.scrollY || document.scrollingElement?.scrollTop || 0);
  scheduleKeyboardSync();
}

function handleFocusOut(event) {
  if (!TEXT_INPUTS.has(event.target)) return;
  setKeyboardState(false);
  scheduleKeyboardSync();
}

export function wireMobileKeyboardLayout() {
  if (!dom.sessionView) return;

  const chatInputs = [dom.messageInput, dom.overlayMessageInput];
  wireChatInputCorrections(chatInputs);
  chatInputs.forEach((input) => {
    if (input) TEXT_INPUTS.add(input);
  });
  baselineHeight = getViewportHeight();
  baselineWidth = getViewportWidth();

  document.addEventListener("focusin", handleFocusIn, { passive: true });
  document.addEventListener("focusout", handleFocusOut, { passive: true });
  window.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.addEventListener("scroll", keepPageScrollLocked, { passive: true });
  window.addEventListener("orientationchange", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleKeyboardSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleKeyboardSync, { passive: true });
  scheduleKeyboardSync();
}

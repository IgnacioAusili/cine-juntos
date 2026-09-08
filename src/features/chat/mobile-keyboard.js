import { dom } from "../../core/dom.js";
import { logEvent } from "../../core/state.js?v=20260902-mobile-real-browser-01";
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
let keyboardPollId = 0;
let keyboardOpeningUntil = 0;
let keyboardOpening = false;
let keyboardWasOpen = false;
let overlayInputFocused = false;

function logKeyboardDiagnostic(label, extra = {}) {
  const viewport = window.visualViewport;
  const keyboard = navigator.virtualKeyboard;
  logEvent("mobile-keyboard-debug", `${label} ${JSON.stringify({
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    chatInputFocused: isChatInputFocused(),
    messageInputFocused: document.activeElement === dom.messageInput,
    overlayInputFocused,
    keyboardOpening,
    keyboardWasOpen,
    baseline: { width: baselineWidth, height: baselineHeight },
    window: { width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY || 0) },
    viewport: viewport ? { width: Math.round(viewport.width), height: Math.round(viewport.height), offsetTop: Math.round(viewport.offsetTop) } : null,
    virtualKeyboard: keyboard ? { overlaysContent: Boolean(keyboard.overlaysContent), height: Math.round(keyboard.boundingRect?.height || 0) } : null,
    ...extra,
  })}`);
}

function isMainChatInput(target) {
  return target === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "bottom";
}

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

function getStructuralViewportHeight() {
  const cssHeight = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-height"),
  );
  return Number.isFinite(cssHeight) && cssHeight > 0
    ? Math.round(cssHeight)
    : getViewportHeight();
}

function getVirtualKeyboardInset() {
  const keyboardHeight = navigator.virtualKeyboard?.boundingRect?.height || 0;
  return Math.max(0, Math.round(keyboardHeight));
}

function isMobileLayout() {
  return window.matchMedia(MOBILE_WIDTH_QUERY).matches;
}

function isChatInputFocused() {
  return TEXT_INPUTS.has(document.activeElement);
}

function isBottomChatInputFocused() {
  return isMobileLayout()
    && document.activeElement === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "bottom";
}

function isBottomChatInputTarget(target) {
  return isMobileLayout()
    && target === dom.messageInput
    && dom.sessionView?.dataset.chatDock === "bottom";
}

function setKeyboardState(isOpen) {
  if (!dom.sessionView) return;
  dom.sessionView.classList.toggle("chat-keyboard-open", isOpen);
  const rootStyle = document.documentElement.style;
  if (isOpen) {
    rootStyle.setProperty(
      "--mobile-keyboard-layout-height",
      `${getStructuralViewportHeight()}px`,
    );
    rootStyle.setProperty(
      "--mobile-keyboard-inset",
      `${getVirtualKeyboardInset() || Math.max(0, baselineHeight - getViewportHeight())}px`,
    );
  } else {
    rootStyle.setProperty(
      "--mobile-keyboard-layout-height",
      `${getStructuralViewportHeight()}px`,
    );
    rootStyle.setProperty("--mobile-keyboard-inset", "0px");
    baselineHeight = getStructuralViewportHeight();
    baselineWidth = getViewportWidth();
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

  const keyboardInset = getVirtualKeyboardInset();
  const keyboardOverlaysContent = Boolean(navigator.virtualKeyboard?.overlaysContent);
  const viewportReduction = keyboardOverlaysContent
    ? 0
    : baselineHeight - currentHeight;
  const hasKeyboardGeometry = keyboardInset >= 24
    || viewportReduction >= KEYBOARD_REDUCTION_PX;
  if (hasKeyboardGeometry) keyboardOpening = false;
  const isKeyboardOpen = isMobileLayout()
    && focused
    && (
      hasKeyboardGeometry
      || (keyboardOpening && performance.now() < keyboardOpeningUntil)
    );
  if (!isKeyboardOpen) keyboardOpening = false;
  if (isKeyboardOpen && !keyboardWasOpen) {
    // En iOS el scroll automático ocurre antes de focusin. Si el toque ya
    // capturó la posición, no la reemplaces por la posición desplazada.
    captureFocusScrollPositionIfNeeded();
  }
  keyboardWasOpen = isKeyboardOpen;
  setKeyboardState(isKeyboardOpen);
  keepPageScrollLocked(keyboardWasOpen || keyboardOpening, overlayInputFocused);
}

function scheduleKeyboardSync() {
  if (syncFrameId) return;
  syncFrameId = window.requestAnimationFrame(syncKeyboardState);
}

function lockPageScroll() {
  keepPageScrollLocked(keyboardWasOpen || keyboardOpening, overlayInputFocused);
}

function startKeyboardPolling() {
  if (keyboardPollId) return;
  keyboardPollId = window.setInterval(() => {
    if (!isChatInputFocused()) {
      window.clearInterval(keyboardPollId);
      keyboardPollId = 0;
      return;
    }
    scheduleKeyboardSync();
  }, 120);
}

function stopKeyboardPolling() {
  if (!keyboardPollId) return;
  window.clearInterval(keyboardPollId);
  keyboardPollId = 0;
}

function handleFocusIn(event) {
  const wasPointerFocused = consumePointerFocus(event.target);
  if (isMainChatInput(event.target)) logKeyboardDiagnostic("focusin", { target: event.target.id, wasPointerFocused });

  if (TEXT_INPUTS.has(event.target)) {
    startKeyboardPolling();
  }

  if (isOverlayChatInput(event.target)) {
    overlayInputFocused = true;
    if (!wasPointerFocused) capturePageScrollPosition();
    scheduleKeyboardSync();
    return;
  }
  if (!TEXT_INPUTS.has(event.target)) return;
  if (!wasPointerFocused) capturePageScrollPosition();
  if (isBottomChatInputFocused()) {
    // Android publica la geometría del teclado después de focusin; marcar el
    // estado durante ese lapso evita que el primer frame quede debajo del IME.
    keyboardOpening = true;
    keyboardOpeningUntil = performance.now() + 1500;
    setKeyboardState(true);
    keepPageScrollLocked(true, false);
  }
  scheduleKeyboardSync();
}

function handleFocusOut(event) {
  if (isMainChatInput(event.target)) logKeyboardDiagnostic("focusout", { target: event.target.id, relatedTarget: event.relatedTarget?.id || event.relatedTarget?.tagName || null });
  if (isOverlayChatInput(event.target)) {
    overlayInputFocused = false;
    keyboardOpening = false;
    keyboardOpeningUntil = 0;
    stopKeyboardPolling();
    scheduleFocusScrollRestore();
    scheduleKeyboardSync();
    return;
  }
  if (!TEXT_INPUTS.has(event.target)) return;
  keyboardOpening = false;
  keyboardOpeningUntil = 0;
  stopKeyboardPolling();
  keyboardWasOpen = false;
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

  if (navigator.virtualKeyboard && "overlaysContent" in navigator.virtualKeyboard) {
    navigator.virtualKeyboard.overlaysContent = true;
  }

  document.addEventListener("pointerdown", (event) => {
    handleChatPointerDown(event.target);
    const composerControl = event.target.closest?.("#messageEmojiButton, #mainMessageSend, #emojiPopover .emoji-option");
    if (composerControl) {
      logKeyboardDiagnostic("pointerdown:composer-control", { target: composerControl.id || composerControl.getAttribute("aria-label") || null, eventType: event.pointerType });
    }
    if (isBottomChatInputTarget(event.target)) {
      keyboardOpening = true;
      keyboardOpeningUntil = performance.now() + 1500;
      startKeyboardPolling();
      keepPageScrollLocked(true, false);
    }
  }, {
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
  navigator.virtualKeyboard?.addEventListener?.("geometrychange", scheduleKeyboardSync, {
    passive: true,
  });
  scheduleKeyboardSync();
}

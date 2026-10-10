import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { logEvent, state } from "../../core/state.js?v=20261010-file-size-refactor-02";

const MOBILE_CHAT_LAYOUT_QUERY = "(max-width: 980px)";

export function isMobileLayout() {
  return Boolean(
    window.matchMedia
    && window.matchMedia(MOBILE_CHAT_LAYOUT_QUERY).matches,
  );
}

function getMobileInteractionSnapshot(input = null) {
  const viewport = window.visualViewport;
  const keyboard = navigator.virtualKeyboard;
  return {
    layout: window.matchMedia?.(MOBILE_CHAT_LAYOUT_QUERY).matches ? "mobile" : "desktop",
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    input: input?.id || null,
    inputFocused: input ? document.activeElement === input : false,
    selection: input
      ? { start: input.selectionStart, end: input.selectionEnd, length: input.value.length }
      : null,
    popoverHidden: dom.emojiPopover?.hidden ?? null,
    popoverAnchor: dom.emojiPopover?.dataset.anchor || null,
    viewport: viewport
      ? { width: Math.round(viewport.width), height: Math.round(viewport.height), offsetTop: Math.round(viewport.offsetTop) }
      : null,
    window: { width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY || 0) },
    virtualKeyboard: keyboard
      ? { overlaysContent: Boolean(keyboard.overlaysContent), height: Math.round(keyboard.boundingRect?.height || 0) }
      : null,
  };
}

export function logMobileInteraction(label, input = null, extra = {}) {
  if (
    input
    && (input !== dom.messageInput || dom.sessionView?.dataset.chatDock !== "bottom")
  ) return;
  logEvent("mobile-keyboard-debug", `${label} ${JSON.stringify({ ...getMobileInteractionSnapshot(input), ...extra })}`);
}

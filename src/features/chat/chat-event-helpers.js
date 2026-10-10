import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { captureExternalChatCollapseScroll, setExternalChatCollapsed } from "./chat-layout.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";

const MOBILE_CHAT_LAYOUT_QUERY = "(max-width: 980px)";
const COLLAPSE_POINTER_HOVER_CLASS = "chat-collapse-pointer-hover";
let pointerHoveredCollapseButton = null;

export function setCollapsePointerHover(button) {
  if (pointerHoveredCollapseButton === button) return;

  pointerHoveredCollapseButton?.classList.remove(COLLAPSE_POINTER_HOVER_CLASS);
  pointerHoveredCollapseButton
    ?.closest(".chat-collapse-hover-zone")
    ?.classList.remove(COLLAPSE_POINTER_HOVER_CLASS);
  pointerHoveredCollapseButton = button;
  button?.classList.add(COLLAPSE_POINTER_HOVER_CLASS);
  button?.closest(".chat-collapse-hover-zone")
    ?.classList.add(COLLAPSE_POINTER_HOVER_CLASS);
}
export function clearCollapsePointerHover() {
  setCollapsePointerHover(null);
}

export function isCollapsePointerHovered(button) {
  return pointerHoveredCollapseButton === button;
}

export function isMobileChatLayout() {
  return Boolean(
    window.matchMedia
    && window.matchMedia(MOBILE_CHAT_LAYOUT_QUERY).matches,
  );
}

export function isBottomChatKeyboardOpen() {
  return document.documentElement.classList.contains("bottom-chat-keyboard-open");
}

export function toggleExternalChatCollapse() {
  setExternalChatCollapsed(
    !dom.sessionView.classList.contains("chat-collapsed"),
  );
  dom.collapseChatButton?.blur();
  dom.expandChatButton?.blur();
}

export function toggleExternalChatCollapseAfterKeyboardCloses() {
  dom.messageInput?.blur();
  dom.overlayMessageInput?.blur();

  const startedAt = performance.now();
  const applyToggle = () => {
    if (isBottomChatKeyboardOpen() && performance.now() - startedAt < 1500) {
      window.requestAnimationFrame(applyToggle);
      return;
    }
    toggleExternalChatCollapse();
  };

  window.requestAnimationFrame(applyToggle);
}

export function handleCollapseButtonClick() {
  clearCollapsePointerHover();
  hideTooltip(true);
  if (isBottomChatKeyboardOpen()) {
    toggleExternalChatCollapseAfterKeyboardCloses();
    return;
  }
  toggleExternalChatCollapse();
}

const CHAT_SCROLL_WHEEL_MULTIPLIER = 0.35;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
export function getWheelScrollDelta(event, container) {
  const rawDeltaY = event.deltaY;
  if (!rawDeltaY) return 0;

  if (event.deltaMode === DOM_DELTA_PAGE) {
    return rawDeltaY * container.clientHeight * CHAT_SCROLL_WHEEL_MULTIPLIER;
  }

  if (event.deltaMode === DOM_DELTA_LINE) {
    return rawDeltaY * 16 * CHAT_SCROLL_WHEEL_MULTIPLIER;
  }

  return rawDeltaY * CHAT_SCROLL_WHEEL_MULTIPLIER;
}

export function applyDampenedWheelScroll(container, event) {
  if (!container || event.ctrlKey) return false;

  const deltaY = getWheelScrollDelta(event, container);
  if (!deltaY) return false;

  const maxScrollTop = container.scrollHeight - container.clientHeight;
  if (maxScrollTop <= 0) return false;

  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + deltaY));
  if (nextScrollTop === container.scrollTop) return false;

  container.scrollTop = nextScrollTop;
  return true;
}

export function shouldBlockWheelForContainer(container, event) {
  if (!container || event.ctrlKey) return false;

  const deltaY = event.deltaY;
  if (!deltaY) return false;

  const maxScrollTop = container.scrollHeight - container.clientHeight;
  // Si el chat no tiene contenido desplazable, dejamos que la rueda llegue a
  // la página en lugar de bloquearla dentro de un contenedor estático.
  if (maxScrollTop <= 0) return false;

  if (deltaY > 0) {
    return container.scrollTop >= maxScrollTop;
  }

  if (deltaY < 0) {
    return container.scrollTop <= 0;
  }

  return false;
}

export function shouldBlockWheelForTextarea(textarea, event) {
  if (!textarea || event.ctrlKey) return false;

  const deltaY = event.deltaY;
  if (!deltaY) return false;

  const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
  // Sin contenido desplazable, la rueda debe seguir propagándose hasta la
  // página en lugar de quedar bloqueada dentro del input.
  if (maxScrollTop <= 0) return false;

  if (deltaY > 0) {
    return textarea.scrollTop >= maxScrollTop;
  }

  if (deltaY < 0) {
    return textarea.scrollTop <= 0;
  }

  return false;
}

export function hasVerticalScroll(element) {
  return Boolean(element && element.scrollHeight - element.clientHeight > 0);
}

export function shouldBlockWheelForComposerControl(control, event) {
  if (!control || event.ctrlKey || !event.deltaY) return false;

  const form = control.closest("form");
  const input = form?.querySelector("textarea");
  const messages = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;

  // Los botones acompañan al input: solo frenan la rueda si alguno de los dos
  // tiene contenido desplazable. Si ambos caben completos, la página debe
  // poder desplazarse normalmente.
  return hasVerticalScroll(messages) || hasVerticalScroll(input);
}

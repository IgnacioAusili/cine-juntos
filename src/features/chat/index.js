// Coordinacion general del chat: cableado de eventos, layout y reexport de submodulos.
import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { CHAT_DOCK_META } from "../../core/utils.js";
import {
  autoResizeMessageInput,
  handlePasteEvent,
  hideEmojiPicker,
  normalizeEmojiShortcodesInput,
  submitMessageFrom,
  toggleEmojiPicker,
  updateCharCounter,
  wireFloatingComposerLayout,
  wireComposerScrollbar,
} from "./chat-input.js?v=20260812-image-media-02";
import { setReplyTarget } from "./chat-reply.js?v=20260812-image-reply-03";
import { checkScrollPosition, syncUnreadBadgesWithVisibility } from "./unread-counters.js";
import {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./message-menu.js";
import {
  setChatDock,
  setExternalChatCollapsed,
  setExternalChatAutoExpandEnabled,
  setInsideChatAutoExpandEnabled,
  setInsideChatStyle,
  setInsideChatVisible,
  syncExternalChatCollapseHandleOffset,
  syncChatAutoExpandControls,
} from "./chat-layout.js?v=20260811-text-stable-motion-01";
import { scheduleMessageTimeAdjustment } from "./message-time-layout.js?v=20260811-layout-motion-01";

const CHAT_SCROLL_WHEEL_MULTIPLIER = 0.35;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

function getWheelScrollDelta(event, container) {
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

function applyDampenedWheelScroll(container, event) {
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

function shouldBlockWheelForContainer(container, event) {
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

function shouldBlockWheelForTextarea(textarea, event) {
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

function hasVerticalScroll(element) {
  return Boolean(element && element.scrollHeight - element.clientHeight > 0);
}

function shouldBlockWheelForComposerControl(control, event) {
  if (!control || event.ctrlKey || !event.deltaY) return false;

  const form = control.closest("form");
  const input = form?.querySelector("textarea");
  const messages = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;

  // Los botones acompañan al input: solo frenan la rueda si alguno de los dos
  // tiene contenido desplazable. Si ambos caben completos, la página debe
  // poder desplazarse normalmente.
  return hasVerticalScroll(messages) || hasVerticalScroll(input);
}

export {
  buildEmojiPicker,
  updateCharCounter,
  sendMessage,
} from "./chat-input.js?v=20260812-image-media-02";
export { renderMessage } from "./chat-render.js?v=20260812-overlay-selector-reply-14";
export {
  clearReplyTarget,
  renderReplyPreview,
  scrollToMessage,
  setReplyTarget,
} from "./chat-reply.js?v=20260811-reply-motion-01";
export { sendVideoEventMessage } from "./chat-system-messages.js?v=20260812-image-media-02";
export {
  checkScrollPosition,
  resetInsideUnread,
  resetPageUnread,
} from "./unread-counters.js";
export {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./message-menu.js";
export {
  getPersistedInsideChatStyle,
  setChatDock,
  setExternalChatAutoExpandEnabled,
  setExternalChatCollapsed,
  setInsideChatAutoExpandEnabled,
  setInsideChatStyle,
  setInsideChatVisible,
  syncChatAutoExpandControls,
  updateCollapseButton,
} from "./chat-layout.js?v=20260811-text-stable-motion-01";

export function wireChatEvents() {
  syncChatAutoExpandControls();
  wireFloatingComposerLayout();

  if ("ResizeObserver" in window && dom.workspace) {
    let pendingHandleSync = 0;
    const chatHandleResizeObserver = new ResizeObserver(() => {
      if (dom.sessionView?.classList.contains("chat-layout-transitioning") || pendingHandleSync) return;
      pendingHandleSync = window.requestAnimationFrame(() => {
        pendingHandleSync = 0;
        syncExternalChatCollapseHandleOffset();
      });
    });
    chatHandleResizeObserver.observe(dom.workspace);
  }
  window.addEventListener("chat-layout-settled", syncExternalChatCollapseHandleOffset, { passive: true });
  window.requestAnimationFrame(syncExternalChatCollapseHandleOffset);

  dom.insideChatAutoExpandSwitch.addEventListener("click", () => {
    setInsideChatAutoExpandEnabled(!state.chat.autoExpandInsideEnabled);
  });

  dom.externalChatAutoExpandSwitch.addEventListener("click", () => {
    setExternalChatAutoExpandEnabled(!state.chat.autoExpandExternalEnabled);
  });

  dom.chatStyleToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-style]");
    if (!button) return;
    setInsideChatStyle(button.dataset.chatStyle);
  });

  dom.playerChatToggleButton.addEventListener("click", () => {
    setInsideChatVisible(
      !dom.playerFrame.classList.contains("chat-inside-open"),
    );
  });

  dom.closeInsideChatButton.addEventListener("click", () => {
    setInsideChatVisible(false);
  });

  dom.dockChatButton.addEventListener("click", () => {
    const currentDock = dom.sessionView.dataset.chatDock || "right";
    setChatDock(CHAT_DOCK_META[currentDock]?.next || "right");
  });

  dom.collapseChatButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });

  dom.collapseChatButton.addEventListener("focus", () => {
    dom.collapseChatButton.blur();
  });

  dom.collapseChatButton.addEventListener("click", () => {
    setExternalChatCollapsed(
      !dom.sessionView.classList.contains("chat-collapsed"),
    );
    dom.collapseChatButton.blur();
  });

  dom.messageEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.messageInput, dom.messageEmojiButton);
  });

  dom.overlayEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.overlayMessageInput, dom.overlayEmojiButton);
  });

  [dom.emojiPopover].forEach((popover) => {
    popover?.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );

    popover?.addEventListener(
      "touchmove",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );
  });

  window.addEventListener(
    "scroll",
    () => {
      if (dom.emojiPopover.hidden) return;
      hideEmojiPicker();
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (dom.emojiPopover.hidden) return;
      if (dom.emojiPopover.contains(event.target)) return;
      if (event.target.closest(".emoji-trigger")) return;

      const activeEmojiInput = state.ui.activeEmojiInput;
      hideEmojiPicker();
      if (activeEmojiInput) {
        window.requestAnimationFrame(() => {
          activeEmojiInput.focus({ preventScroll: true });
        });
      }
      event.preventDefault();
    },
    true,
  );

  document.addEventListener("click", (event) => {
    if (dom.emojiPopover.hidden) return;
    if (dom.emojiPopover.contains(event.target)) return;
    if (event.target.closest(".emoji-trigger")) return;
    hideEmojiPicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || dom.emojiPopover.hidden) return;
    hideEmojiPicker();
  });

  document.addEventListener("click", (event) => {
    if (dom.messageMenu.hidden) return;
    if (Date.now() - state.chat.messageMenuOpenedAt < 220) return;
    if (dom.messageMenu.contains(event.target)) return;
    hideMessageMenu();
  });

  dom.messageMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action || !state.chat.menuMessage) return;
    if (action === "copy") copyMessageText(state.chat.menuMessage);
    if (action === "reply") setReplyTarget(state.chat.menuMessage, state.chat.menuReplyInput);
    hideMessageMenu();
  });

  dom.messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.messageInput);
  });

  dom.overlayMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.overlayMessageInput);
  });

  [dom.messageInput, dom.overlayMessageInput].forEach((input) => {
    const isOverlay = input === dom.overlayMessageInput;
    wireComposerScrollbar(input);
    input.addEventListener("input", () => {
      normalizeEmojiShortcodesInput(input);
      autoResizeMessageInput(input);
      updateCharCounter(input, isOverlay);
    });
    input.addEventListener("paste", () =>
      window.setTimeout(() => {
        normalizeEmojiShortcodesInput(input);
        autoResizeMessageInput(input);
        updateCharCounter(input, isOverlay);
      }, 0),
    );
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessageFrom(input);
      }
    });
  });

  dom.messageInput.addEventListener("paste", (event) =>
    handlePasteEvent(event, false),
  );
  dom.overlayMessageInput.addEventListener("paste", (event) =>
    handlePasteEvent(event, true),
  );

  dom.mainScrollBottomBtn.addEventListener("click", () => {
    dom.messages.scrollTo({
      top: dom.messages.scrollHeight,
      behavior: "smooth",
    });
    checkScrollPosition(false);
  });
  dom.overlayScrollBottomBtn.addEventListener("click", () => {
    dom.overlayMessages.scrollTo({
      top: dom.overlayMessages.scrollHeight,
      behavior: "smooth",
    });
    checkScrollPosition(true);
  });

  dom.messages.addEventListener("scroll", () => checkScrollPosition(false), {
    passive: true,
  });
  dom.overlayMessages.addEventListener(
    "scroll",
    () => checkScrollPosition(true),
    { passive: true },
  );

  dom.overlayMessages.addEventListener(
    "wheel",
    (event) => {
      if (!dom.playerFrame.classList.contains("chat-inside-open")) return;
      if (applyDampenedWheelScroll(dom.overlayMessages, event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!shouldBlockWheelForContainer(dom.overlayMessages, event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );

  dom.messages.addEventListener(
    "wheel",
    (event) => {
      if (applyDampenedWheelScroll(dom.messages, event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!shouldBlockWheelForContainer(dom.messages, event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );

  [dom.replyPreview, dom.overlayReplyPreview].forEach((preview) => {
    preview?.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );
  });

  [dom.messageInput, dom.overlayMessageInput].forEach((input) => {
    input?.addEventListener(
      "wheel",
      (event) => {
        const form = input.closest("form");
        const messages = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;
        if (!hasVerticalScroll(input) && hasVerticalScroll(messages)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!shouldBlockWheelForTextarea(input, event)) return;
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );
  });

  [
    dom.messageEmojiButton,
    dom.overlayEmojiButton,
    dom.mainMessageSend,
    dom.overlayMessageSend,
  ].forEach((button) => {
    button?.addEventListener(
      "wheel",
      (event) => {
        if (!shouldBlockWheelForComposerControl(button, event)) return;
        event.preventDefault();
        event.stopPropagation();
      },
      { passive: false },
    );
  });

  [dom.mainMessageSend, dom.overlayMessageSend].forEach((button) => {
    button?.addEventListener("mousedown", (event) => event.preventDefault());
  });

  window.addEventListener("scroll", syncUnreadBadgesWithVisibility, {
    passive: true,
  });
  window.addEventListener("resize", syncUnreadBadgesWithVisibility, {
    passive: true,
  });
  window.addEventListener("resize", syncExternalChatCollapseHandleOffset, {
    passive: true,
  });
  window.addEventListener("resize", scheduleMessageTimeAdjustment, {
    passive: true,
  });
  window.addEventListener("load", scheduleMessageTimeAdjustment, { once: true });
  document.addEventListener("visibilitychange", syncUnreadBadgesWithVisibility);
}

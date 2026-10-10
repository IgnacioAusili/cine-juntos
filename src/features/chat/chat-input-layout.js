import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { hideEmojiPicker } from "./emoji-picker.js?v=20261010-file-size-refactor-02";
import { isPinnedToBottom, queuePinnedChatScrollSync } from "./chat-scroll-sync.js?v=20261010-file-size-refactor-02";
import { wireChatScrollbar, syncChatScrollbar, syncComposerScrollbar } from "./chat-scrollbar.js?v=20261010-file-size-refactor-02";
import { isMobileLayout } from "./chat-input-debug.js?v=20261010-file-size-refactor-02";

const floatingComposerObservers = new WeakMap();

const CHAT_MESSAGE_BOTTOM_GAP = 12;

const CHAT_OVERLAY_MESSAGE_BOTTOM_GAP = 4;

const CHAT_RESERVE_TRANSITION_MS = 180;

export function autoResizeMessageInput(input) {
  const isOverlay = input === dom.overlayMessageInput;
  const messagesContainer = isOverlay ? dom.overlayMessages : dom.messages;
  const wasPinnedToBottom = isPinnedToBottom(messagesContainer);

  const maxHeight = isOverlay ? 86 : 118;
  const mobileMinHeight = isMobileLayout();
  const minHeight = mobileMinHeight ? 30 : (isOverlay ? 30 : 36);
  const wrapper = input.closest(".input-wrapper");

  input.style.height = `${minHeight}px`;
  // El padding del textarea cambia cuando pasa a multilinea. Resolver el
  // estado antes de la medición final evita calcular la altura con la métrica
  // anterior y producir un salto en el primer Enter.
  const shouldExpand = input.scrollHeight > minHeight + 4;
  if (wrapper) {
    wrapper.dataset.expanded = String(shouldExpand);
  }

  const contentHeight = input.scrollHeight;
  input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
  input.scrollTop = input.scrollHeight;
  syncComposerScrollbar(input);
  queuePinnedChatScrollSync(messagesContainer, isOverlay, wasPinnedToBottom);
}

export function wireFloatingComposerLayout() {
  [dom.messageForm, dom.overlayMessageForm].forEach((form) => {
    if (!form || floatingComposerObservers.has(form)) return;

    const container = form.closest(".chat-area, .player-chat");
    if (!container) return;
    const messagesContainer = form === dom.overlayMessageForm ? dom.overlayMessages : dom.messages;
    const messagesWrap = messagesContainer?.closest(".messages-wrap");
    const inputWrapper = form.querySelector(".input-wrapper");
    wireChatScrollbar(messagesContainer);
    let reserveAnimationFrame = 0;
    let currentMessageReserve = null;

    const setMessageReserve = (value, keepAtBottom) => {
      const nextValue = Math.max(0, value);
      currentMessageReserve = nextValue;
      container.style.setProperty("--chat-message-bottom-reserve", `${nextValue}px`);
      if (keepAtBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    const animateMessageReserve = (targetValue, keepAtBottom, startValueOverride = null) => {
      if (reserveAnimationFrame) {
        window.cancelAnimationFrame(reserveAnimationFrame);
        reserveAnimationFrame = 0;
      }

      const startValue = startValueOverride ?? currentMessageReserve;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (
        startValue == null
        || Math.abs(startValue - targetValue) < 0.5
        || reducedMotion
      ) {
        setMessageReserve(targetValue, keepAtBottom);
        return;
      }

      const startedAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / CHAT_RESERVE_TRANSITION_MS);
        const easedProgress = 1 - ((1 - progress) ** 3);
        const value = startValue + ((targetValue - startValue) * easedProgress);
        setMessageReserve(value, keepAtBottom);
        if (progress < 1) {
          reserveAnimationFrame = window.requestAnimationFrame(tick);
        } else {
          reserveAnimationFrame = 0;
        }
      };
      reserveAnimationFrame = window.requestAnimationFrame(tick);
    };

    const updateReserve = () => {
      const wasPinnedToBottom = isPinnedToBottom(messagesContainer);
      const formRect = form.getBoundingClientRect();
      const reserve = Math.ceil(formRect.height);
      const computedStyle = window.getComputedStyle(form);
      const bottomGap = Math.max(0, Math.round(Number.parseFloat(computedStyle.bottom) || 0));
      const messageGap = form === dom.overlayMessageForm
        ? CHAT_OVERLAY_MESSAGE_BOTTOM_GAP
        : CHAT_MESSAGE_BOTTOM_GAP;
      const messageReserve = reserve + bottomGap + 2 + messageGap;
      if (messagesWrap && inputWrapper) {
        const messagesWrapRect = messagesWrap.getBoundingClientRect();
        const inputRect = inputWrapper.getBoundingClientRect();
        const replyPreviewOffset = Math.max(
          6,
          Math.ceil(formRect.bottom - inputRect.top + 6),
        );
        form.style.setProperty(
          "--reply-preview-offset",
          `${replyPreviewOffset}px`,
        );
        const visualEnd = Math.max(0, Math.round(inputRect.top - messagesWrapRect.top));
        messagesWrap.style.setProperty("--chat-scrollbar-visual-end", `${visualEnd}px`);
        syncChatScrollbar(messagesContainer);
      }
      container.style.setProperty("--chat-composer-reserve", `${reserve}px`);
      const inlineMessageReserve = Number.parseFloat(
        container.style.getPropertyValue("--chat-message-bottom-reserve"),
      );
      animateMessageReserve(
        messageReserve,
        wasPinnedToBottom,
        Number.isFinite(inlineMessageReserve) ? inlineMessageReserve : null,
      );
    };

    let reserveFrame = 0;
    const scheduleReserveUpdate = () => {
      if (form === dom.messageForm && dom.sessionView?.classList.contains("chat-layout-transitioning")) return;
      if (reserveFrame) return;
      reserveFrame = window.requestAnimationFrame(() => {
        reserveFrame = 0;
        updateReserve();
      });
    };
    const observer = new ResizeObserver(scheduleReserveUpdate);
    const syncReplyPreviewReserve = () => {
      if (reserveFrame) {
        window.cancelAnimationFrame(reserveFrame);
        reserveFrame = 0;
      }
      updateReserve();
    };

    floatingComposerObservers.set(form, observer);
    observer.observe(form);
    window.addEventListener("resize", scheduleReserveUpdate, { passive: true });
    window.addEventListener("chat-reply-preview-layout", syncReplyPreviewReserve, { passive: true });
    if (form === dom.messageForm) {
      window.addEventListener("chat-layout-settled", scheduleReserveUpdate, { passive: true });
    }
    updateReserve();
  });
}

function observeComposerWidth(input) {
  const shell = input?.closest(".textarea-shell");
  if (!input || !shell || input.dataset.composerWidthObserverBound === "true") return;
  input.dataset.composerWidthObserverBound = "true";

  const resize = () => autoResizeMessageInput(input);
  if (typeof ResizeObserver !== "function") {
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("chat-layout-settled", resize, { passive: true });
    return;
  }

  let previousWidth = shell.getBoundingClientRect().width;
  let resizeTimer = 0;
  const observer = new ResizeObserver(([entry]) => {
    const nextWidth = entry?.contentRect?.width;
    if (!Number.isFinite(nextWidth) || Math.abs(nextWidth - previousWidth) < 0.5) return;

    previousWidth = nextWidth;
    window.clearTimeout(resizeTimer);
    // El ancho puede animarse durante el cambio de dock. Medir al final evita
    // dejar la altura calculada para la superficie anterior.
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
    }, 60);
  });
  observer.observe(shell);
}


[dom.messageInput, dom.overlayMessageInput].forEach(observeComposerWidth);

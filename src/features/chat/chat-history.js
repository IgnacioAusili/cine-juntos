import { dom } from "../../core/dom.js";
import { logEvent, state } from "../../core/state.js?v=20261008";
import {
  isExternalChatVisibleToUser,
  isInsideChatVisibleToUser,
} from "./unread-counters.js?v=20261009-auto-expand-tooltip-01";
import { renderMessage } from "./chat-render.js?v=20261009-auto-expand-tooltip-01";

let historyGeneration = 0;
let historyExhausted = false;
let historyLoadPromise = null;

export function resetChatHistoryPaging() {
  historyGeneration += 1;
  historyExhausted = false;
  historyLoadPromise = null;
}

export function loadOlderChatHistory(initiatingContainer = dom.messages, pageSize) {
  if (historyExhausted) return Promise.resolve(false);
  if (historyLoadPromise) return historyLoadPromise;

  const transport = state.session.transport;
  if (typeof transport?.loadOlderMessages !== "function") {
    historyExhausted = true;
    return Promise.resolve(false);
  }

  const generation = historyGeneration;
  const task = (async () => {
    try {
      const page = await transport.loadOlderMessages(pageSize);
      if (
        generation !== historyGeneration
        || transport !== state.session.transport
      ) return false;

      const messages = Array.isArray(page?.messages) ? page.messages : [];
      if (!messages.length) {
        historyExhausted = true;
        return false;
      }
      if (page.hasMore === false) historyExhausted = true;
      const scrollPositions = captureScrollPositions(initiatingContainer);

      for (const message of [...messages].reverse()) {
        await renderMessage(message, {
          animateSystemGroups: false,
          isHistory: true,
          prepend: true,
        });
      }
      await nextFrame();

      if (generation !== historyGeneration) return false;
      restoreScrollPositions(scrollPositions);
      return true;
    } catch (error) {
      if (generation === historyGeneration) {
        logEvent("chat", `No se pudo cargar el historial anterior: ${error?.message || error}`);
      }
      return false;
    }
  })();

  const sharedTask = task.finally(() => {
    if (historyLoadPromise === sharedTask) historyLoadPromise = null;
  });
  historyLoadPromise = sharedTask;
  return sharedTask;
}

export async function fillChatHistoryViewport() {
  const container = getVisibleHistoryContainer();
  if (!container || container.clientHeight <= 0) return;

  while (
    !historyExhausted
    && container.clientHeight > 0
    && container.scrollHeight <= container.clientHeight
  ) {
    const loaded = await loadOlderChatHistory(container, estimatePageSize(container));
    if (!loaded) return;
  }
}

function estimatePageSize(container) {
  const renderedMessages = [...container.children]
    .filter((child) => child.classList.contains("message"));
  const averageMessageHeight = renderedMessages.length
    ? renderedMessages.reduce((total, message) => total + message.getBoundingClientRect().height, 0)
      / renderedMessages.length
    : 72;
  const remainingHeight = Math.max(0, container.clientHeight - container.scrollHeight);
  return Math.max(1, Math.min(12, Math.ceil(remainingHeight / Math.max(1, averageMessageHeight)) + 1));
}

function getVisibleHistoryContainer() {
  if (isInsideChatVisibleToUser()) return dom.overlayMessages;
  if (isExternalChatVisibleToUser()) return dom.messages;
  return null;
}

function captureScrollPositions(initiatingContainer) {
  return [dom.messages, dom.overlayMessages]
    .filter(Boolean)
    .map((container) => {
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceFromBottom = scrollHeight - container.scrollTop - clientHeight;
      const visible = container === initiatingContainer || (container === dom.messages
        ? isExternalChatVisibleToUser()
        : isInsideChatVisibleToUser());
      const viewportTop = container.getBoundingClientRect().top;
      const anchor = [...container.querySelectorAll(":scope > .message[data-message-id]")]
        .find((message) => message.getBoundingClientRect().bottom > viewportTop);
      return {
        container,
        anchor,
        anchorTop: anchor?.getBoundingClientRect().top ?? null,
        scrollHeight,
        scrollTop: container.scrollTop,
        keepAtBottom: !visible || clientHeight <= 0 || distanceFromBottom <= 1,
      };
    });
}

function restoreScrollPositions(positions) {
  positions.forEach(({ container, anchor, anchorTop, scrollHeight, scrollTop, keepAtBottom }) => {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (keepAtBottom) {
      container.scrollTop = maxScrollTop;
      return;
    }

    const anchorOffset = anchor?.isConnected && anchorTop !== null
      ? anchor.getBoundingClientRect().top - anchorTop
      : container.scrollHeight - scrollHeight;
    const targetTop = scrollTop + anchorOffset;
    container.scrollTop = Math.min(maxScrollTop, Math.max(0, targetTop));
  });
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

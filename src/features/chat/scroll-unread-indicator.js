import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";

export function incrementScrollIndicator(isOverlay) {
  const container = isOverlay ? dom.overlayMessages : dom.messages;
  if (isOverlay) {
    state.chat.overlayScrollUnread += 1;
  } else {
    state.chat.mainScrollUnread += 1;
  }
  let latestMessage = container.lastElementChild;
  while (latestMessage && !latestMessage.classList.contains("message")) {
    latestMessage = latestMessage.previousElementSibling;
  }
  if (latestMessage?.classList.contains("message")) {
    latestMessage.dataset.scrollUnread = "true";
  }
  updateScrollIndicator(isOverlay);
  decrementVisibleUnreadMessages(isOverlay);
}

export function resetScrollIndicator(isOverlay) {
  const container = isOverlay ? dom.overlayMessages : dom.messages;
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

  container.querySelectorAll(".message[data-scroll-unread='true']").forEach((message) => {
    delete message.dataset.scrollUnread;
  });
  if (isOverlay) {
    state.chat.overlayScrollUnread = 0;
  } else {
    state.chat.mainScrollUnread = 0;
  }

  badge.textContent = "0";
  badge.hidden = true;
  btn.classList.remove("scroll-bottom-btn--visible");
  window.setTimeout(() => {
    if (!btn.classList.contains("scroll-bottom-btn--visible")) {
      btn.hidden = true;
    }
  }, 300);
}

function updateScrollIndicator(isOverlay) {
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;
  const unreadCount = isOverlay ? state.chat.overlayScrollUnread : state.chat.mainScrollUnread;

  badge.textContent = unreadCount > 99 ? "+99" : String(unreadCount);
  badge.hidden = unreadCount === 0;
  if (unreadCount > 0) {
    const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
    btn.hidden = false;
    btn.classList.add("scroll-bottom-btn--visible");
  } else {
    resetScrollIndicator(isOverlay);
  }
}

function decrementVisibleUnreadMessages(isOverlay) {
  if (document.hidden) return;

  const { container, top, left, bottom, right } = getMessageVisibilityBounds(isOverlay);
  let visibleCount = 0;

  container.querySelectorAll(".message[data-scroll-unread='true']").forEach((message) => {
    const rect = message.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
    const visibleWidth = Math.min(rect.right, right) - Math.max(rect.left, left);
    if (visibleHeight <= 0 || visibleWidth <= 0 || visibleHeight / rect.height < 0.25) return;
    delete message.dataset.scrollUnread;
    visibleCount += 1;
  });

  if (visibleCount === 0) return;
  if (isOverlay) {
    state.chat.overlayScrollUnread = Math.max(0, state.chat.overlayScrollUnread - visibleCount);
  } else {
    state.chat.mainScrollUnread = Math.max(0, state.chat.mainScrollUnread - visibleCount);
  }
  updateScrollIndicator(isOverlay);
}

function getMessageVisibilityBounds(isOverlay) {
  const container = isOverlay ? dom.overlayMessages : dom.messages;
  const bounds = container.getBoundingClientRect();
  const top = bounds.top + container.clientTop;
  const left = bounds.left + container.clientLeft;
  const input = isOverlay ? dom.overlayMessageInput : dom.messageInput;
  const inputBounds = input?.getBoundingClientRect();
  const inputBoundaryIsVisible = inputBounds?.width > 0
    && inputBounds?.height > 0
    && inputBounds.top >= top
    && inputBounds.top <= top + container.clientHeight;
  const inputTop = inputBoundaryIsVisible
    ? inputBounds.top
    : top + container.clientHeight;
  const bottom = Math.max(top, Math.min(top + container.clientHeight, inputTop));

  return {
    container,
    top,
    left,
    bottom,
    right: left + container.clientWidth,
  };
}

function hasUnreadBelowInput(isOverlay) {
  const { container, bottom } = getMessageVisibilityBounds(isOverlay);
  return [...container.querySelectorAll(".message[data-scroll-unread='true']")]
    .some((message) => message.getBoundingClientRect().bottom > bottom);
}

export function checkScrollPosition(isOverlay) {
  if (document.hidden) return;

  const container = isOverlay ? dom.overlayMessages : dom.messages;
  const threshold = 80;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  decrementVisibleUnreadMessages(isOverlay);

  const unreadCount = isOverlay ? state.chat.overlayScrollUnread : state.chat.mainScrollUnread;
  if (distanceFromBottom <= threshold && unreadCount > 0 && !hasUnreadBelowInput(isOverlay)) {
    resetScrollIndicator(isOverlay);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  checkScrollPosition(false);
  checkScrollPosition(true);
});

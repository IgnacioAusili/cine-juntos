import { dom } from "../../core/dom.js";
import { state } from "../../core/state.js?v=20260902-mobile-real-browser-01";
import {
  setExternalChatCollapsed,
  setInsideChatVisible,
} from "./chat-layout.js?v=20260904-mobile-landscape-bottom-chat-07";

function isElementVisibleInViewport(element) {
  if (!element || document.hidden) return false;

  const styles = window.getComputedStyle(element);
  if (
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    Number(styles.opacity) === 0
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return visibleWidth > 24 && visibleHeight > 24;
}

export function isInsideChatVisibleToUser() {
  if (!dom.playerFrame.classList.contains("chat-inside-open")) return false;
  return isElementVisibleInViewport(dom.playerChat);
}

export function isExternalChatVisibleToUser() {
  if (dom.sessionView.classList.contains("chat-collapsed")) return false;
  return isElementVisibleInViewport(dom.chatArea);
}

export function isAnyChatVisibleToUser() {
  return isInsideChatVisibleToUser() || isExternalChatVisibleToUser();
}

export function incrementInsideUnread() {
  state.chat.unreadInsideCount += 1;
  const countElement = dom.insideChatUnread.querySelector(".player-chat-unread-count");
  (countElement || dom.insideChatUnread).textContent = state.chat.unreadInsideCount > 99
    ? "+99"
    : String(state.chat.unreadInsideCount);
  dom.insideChatUnread.hidden = false;
}

export function resetInsideUnread() {
  state.chat.unreadInsideCount = 0;
  dom.insideChatUnread.hidden = true;
}

function updatePageTitle() {
  const unreadCount = state.chat.pageUnreadCount;
  const baseTitle = state.chat.pageTitleBase || document.title;
  document.title = unreadCount > 0 ? `(+${unreadCount}) ${baseTitle}` : baseTitle;
}

export function incrementPageUnread() {
  state.chat.pageUnreadCount += 1;
  updatePageTitle();
}

export function resetPageUnread() {
  state.chat.pageUnreadCount = 0;
  updatePageTitle();
}

export function syncUnreadBadgesWithVisibility() {
  // Una apertura automática debe conservar el contador hasta que haya una
  // respuesta; de lo contrario el propio cambio de visibilidad lo borra.
  const externalVisible = isExternalChatVisibleToUser();
  const insideVisible = isInsideChatVisibleToUser();
  if (
    externalVisible
    || (
      insideVisible
      && !state.chat.autoOpenedInside
      && !state.chat.autoOpenedExternal
    )
  ) {
    resetInsideUnread();
  }
  if (!document.hidden) {
    resetPageUnread();
  }
}

export function handleIncomingUnread() {
  const insideVisible = isInsideChatVisibleToUser();
  const externalVisible = isExternalChatVisibleToUser();

  if (
    externalVisible
    || (insideVisible && !state.chat.autoOpenedInside)
  ) {
    resetInsideUnread();
  } else {
    incrementInsideUnread();
    if (state.chat.autoExpandInsideEnabled && !insideVisible) {
      setInsideChatVisible(true, { source: "auto" });
    }
  }

  if (state.chat.autoExpandExternalEnabled && !externalVisible) {
    setExternalChatCollapsed(false, { source: "auto" });
  }
}

export function handleIncomingPageUnread() {
  if (!document.hidden) return;
  incrementPageUnread();
}

export function incrementScrollIndicator(isOverlay) {
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

  if (isOverlay) {
    state.chat.overlayScrollUnread += 1;
    badge.textContent = state.chat.overlayScrollUnread > 99 ? "+99" : String(state.chat.overlayScrollUnread);
  } else {
    state.chat.mainScrollUnread += 1;
    badge.textContent = state.chat.mainScrollUnread > 99 ? "+99" : String(state.chat.mainScrollUnread);
  }

  const count = isOverlay ? state.chat.overlayScrollUnread : state.chat.mainScrollUnread;
  badge.hidden = count === 0;
  btn.hidden = false;
  btn.classList.add("scroll-bottom-btn--visible");
}

export function resetScrollIndicator(isOverlay) {
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

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

export function checkScrollPosition(isOverlay) {
  const container = isOverlay ? dom.overlayMessages : dom.messages;
  const threshold = 80;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  if (distanceFromBottom <= threshold) {
    resetScrollIndicator(isOverlay);
  }
}

import { dom } from "../core/dom.js";
import { state } from "../core/state.js";

export function incrementInsideUnread() {
  state.chat.unreadInsideCount += 1;
  dom.insideChatUnread.textContent = String(Math.min(state.chat.unreadInsideCount, 99));
  dom.insideChatUnread.hidden = false;
  dom.playerChatToggleButton.classList.add("has-unread");
}

export function resetInsideUnread() {
  state.chat.unreadInsideCount = 0;
  dom.insideChatUnread.hidden = true;
  dom.playerChatToggleButton.classList.remove("has-unread");
}

export function incrementExternalUnread() {
  state.chat.unreadExternalCount += 1;
  dom.externalChatUnread.textContent = String(Math.min(state.chat.unreadExternalCount, 99));
  dom.externalChatUnread.hidden = false;
}

export function resetExternalUnread() {
  state.chat.unreadExternalCount = 0;
  dom.externalChatUnread.hidden = true;
}

export function incrementScrollIndicator(isOverlay) {
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

  if (isOverlay) {
    state.chat.overlayScrollUnread += 1;
    badge.textContent = state.chat.overlayScrollUnread > 99 ? "99+" : String(state.chat.overlayScrollUnread);
  } else {
    state.chat.mainScrollUnread += 1;
    badge.textContent = state.chat.mainScrollUnread > 99 ? "99+" : String(state.chat.mainScrollUnread);
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

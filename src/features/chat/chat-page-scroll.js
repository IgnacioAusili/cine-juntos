import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

export function isFullscreenPageActive() {
  return Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
}
export function getPageScrollContainer() {
  if (!isFullscreenPageActive()) return window;
  return dom.sessionView?.closest(".app-shell") || document.scrollingElement || document.documentElement;
}

export function getPageScrollTop() {
  if (!isFullscreenPageActive()) return Math.round(window.scrollY || 0);
  return Math.round(getPageScrollContainer().scrollTop || 0);
}

export function getPageScrollMax() {
  if (!isFullscreenPageActive()) {
    return Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  }

  const container = getPageScrollContainer();
  return Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
}

export function getElementPageTop(element) {
  if (!element) return 0;
  if (!isFullscreenPageActive()) {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  const container = getPageScrollContainer();
  const containerRect = container.getBoundingClientRect();
  return element.getBoundingClientRect().top - containerRect.top + (container.scrollTop || 0);
}

export function scrollPageTo(top, behavior = "auto") {
  if (isFullscreenPageActive()) {
    getPageScrollContainer().scrollTo({ top, behavior });
    return;
  }

  window.scrollTo({ top, behavior });
}

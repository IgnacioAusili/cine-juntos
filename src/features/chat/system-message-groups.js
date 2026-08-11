import { dom } from "../../core/dom.js";
import { isPinnedToBottom, queuePinnedChatScrollSync } from "./chat-scroll-sync.js";

const SYSTEM_GROUP_MIN_SIZE = 3;
const SYSTEM_GROUP_IDLE_MS = 3200;
const SYSTEM_GROUP_ANIMATION_MS = 280;
const containerStates = new WeakMap();
const messageAnimations = new WeakMap();
const collapseRuns = new WeakMap();

export function scheduleSystemMessageCollapse(container) {
  if (!container) return;

  const candidate = getLatestSystemStreak(container);
  const current = containerStates.get(container) || { timer: null, collapsed: false };
  window.clearTimeout(current.timer);

  if (candidate.length < SYSTEM_GROUP_MIN_SIZE) {
    collapseRuns.set(container, (collapseRuns.get(container) || 0) + 1);
    current.collapsed = false;
    current.timer = null;
    containerStates.set(container, current);
    clearSystemGroupState(container, candidate);
    return;
  }

  const expandedToggle = container.querySelector('.system-group-toggle[aria-expanded="true"]');
  if (expandedToggle) {
    current.collapsed = false;
    syncSystemGroupLastMarker(candidate);
    updateToggleCount(expandedToggle, getSystemGroupHiddenCount(candidate), true);
    syncSystemGroupTogglePosition(expandedToggle, container, candidate.at(-1));
    containerStates.set(container, current);
    return;
  }

  const isAlreadyCollapsed = current.collapsed;
  if (isAlreadyCollapsed) {
    applyCollapsedState(candidate, false);
  }

  current.timer = window.setTimeout(() => {
    const latest = getLatestSystemStreak(container);
    if (latest.length < SYSTEM_GROUP_MIN_SIZE) return;
    applyCollapsedState(latest, true);
    current.collapsed = true;
  }, SYSTEM_GROUP_IDLE_MS);
  containerStates.set(container, current);
}

function getLatestSystemStreak(container) {
  const children = Array.from(container.children).filter((child) => child.classList.contains("message"));
  if (!children.length) return [];

  let end = children.length;
  if (!children[end - 1]?.classList.contains("system")) end -= 1;

  let start = end;
  while (start > 0 && children[start - 1].classList.contains("system")) start -= 1;
  return children.slice(start, end);
}

function clearSystemGroupState(container, items = []) {
  container?.querySelector(".system-group-toggle")?.remove();
  items.forEach((item) => {
    item.classList.remove("system-group-collapsed-item", "system-group-last");
  });
}

function syncSystemGroupLastMarker(items) {
  const visibleItem = items.at(-1);
  items.forEach((item) => {
    item.classList.toggle("system-group-last", item === visibleItem);
  });
}

function applyCollapsedState(items, animate) {
  const visibleItem = items.at(-1);
  if (!visibleItem) return;
  const container = visibleItem.parentElement;
  const wasPinnedToBottom = isPinnedToBottom(container);
  const runId = (collapseRuns.get(container) || 0) + 1;
  collapseRuns.set(container, runId);
  container?.querySelector(".system-group-toggle")?.remove();

  const hiddenItems = items.slice(0, -1);
  const animations = hiddenItems.map((item) => {
    if (animate) return animateMessage(item, false);
    item.classList.add("system-group-collapsed-item");
    return null;
  });
  visibleItem.classList.remove("system-group-collapsed-item");
  syncSystemGroupLastMarker(items);

  const appendToggle = () => {
    const latest = container ? getLatestSystemStreak(container).at(-1) : null;
    if (!visibleItem.isConnected || latest !== visibleItem || collapseRuns.get(container) !== runId) return;

    const hiddenCount = getSystemGroupHiddenCount(items);
    if (!hiddenCount) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "system-group-toggle";
    toggle.setAttribute("aria-expanded", "false");
    updateToggleCount(toggle, hiddenCount, false);
    syncSystemGroupTogglePosition(toggle, container, visibleItem);
    toggle.addEventListener("pointerdown", (event) => event.stopPropagation());
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSystemGroup(items, toggle);
    });
    container.append(toggle);
    window.requestAnimationFrame(() => {
      if (toggle.isConnected && visibleItem.isConnected) {
        syncSystemGroupTogglePosition(toggle, container, visibleItem);
      }
    });
  };

  if (animate) {
    Promise.all(animations).then(() => {
      appendToggle();
      if (wasPinnedToBottom) queuePinnedChatScrollSync(container, container === dom.overlayMessages, true);
    });
  } else {
    appendToggle();
    if (wasPinnedToBottom) queuePinnedChatScrollSync(container, container === dom.overlayMessages, true);
  }
}

function toggleSystemGroup(items, toggle) {
  const isExpanded = toggle.getAttribute("aria-expanded") === "true";
  const nextExpanded = !isExpanded;
  const container = items[0]?.parentElement;
  const currentItems = container ? getLatestSystemStreak(container) : items;
  const hiddenCount = getSystemGroupHiddenCount(currentItems);
  const wasPinnedToBottom = isPinnedToBottom(container);
  if (!hiddenCount) {
    toggle.remove();
    clearSystemGroupState(container, currentItems);
    return;
  }
  collapseRuns.set(container, (collapseRuns.get(container) || 0) + 1);

  toggle.setAttribute("aria-expanded", String(!isExpanded));
  updateToggleCount(toggle, hiddenCount, nextExpanded);

  const animations = currentItems.slice(0, -1).map((item) => {
    if (isExpanded) {
      return animateMessage(item, false);
    } else {
      return animateMessage(item, true);
    }
  });
  const state = containerStates.get(container);
  if (state) state.collapsed = !isExpanded;

  const fixedTop = toggle.style.top;
  Promise.all(animations).then(() => {
    if (!toggle.isConnected) return;
    const latestItems = container ? getLatestSystemStreak(container) : currentItems;
    const latestVisibleItem = latestItems.at(-1) || currentItems.at(-1) || items.at(-1);
    updateToggleCount(toggle, getSystemGroupHiddenCount(latestItems), nextExpanded);
    syncSystemGroupLastMarker(latestItems);
    syncSystemGroupTogglePosition(toggle, container, latestVisibleItem, { horizontalOnly: true });
    toggle.style.top = fixedTop;
    if (wasPinnedToBottom) queuePinnedChatScrollSync(container, container === dom.overlayMessages, true);
  });
}

function updateToggleCount(toggle, hiddenCount, expanded) {
  const safeHiddenCount = Math.max(0, hiddenCount);
  toggle.setAttribute(
    "aria-label",
    `${expanded ? "Ocultar" : "Mostrar"} ${safeHiddenCount} mensajes de sincronización`,
  );
  toggle.innerHTML = `${getChevronMarkup(expanded)}<span class="system-group-toggle-count">${safeHiddenCount}</span>`;
}

function getSystemGroupHiddenCount(items) {
  return Math.max(0, items.length - 1);
}

function positionSystemGroupToggle(toggle, container, visibleItem, options = {}) {
  syncSystemGroupTogglePosition(toggle, container, visibleItem, options);
}

function syncSystemGroupTogglePosition(toggle, container, visibleItem, options = {}) {
  const row = visibleItem.querySelector(".system-message-row");
  if (!row || !container) return;

  const containerRect = container.getBoundingClientRect();
  const bubble = visibleItem.querySelector(".message-system-bubble") || row;
  const bubbleRect = bubble.getBoundingClientRect();
  const buttonHeight = Number.parseFloat(getComputedStyle(toggle).height) || 18;
  const buttonWidth = 26;
  const decorationLineCenter = bubbleRect.top + bubbleRect.height / 2;
  const top = decorationLineCenter - containerRect.top + container.scrollTop - buttonHeight / 2;
  const lineGap = 12;
  const left = bubbleRect.left - containerRect.left + container.scrollLeft - buttonWidth - lineGap;
  if (!options.horizontalOnly) toggle.style.top = `${Math.max(0, top)}px`;
  toggle.style.left = `${Math.max(0, left)}px`;
  toggle.style.right = "auto";
  toggle.style.bottom = "auto";
}

function animateMessage(item, show) {
  const fromHeight = item.getBoundingClientRect().height;
  const currentStyles = getComputedStyle(item);
  const fromMarginTop = currentStyles.marginTop;
  const fromMarginBottom = currentStyles.marginBottom;
  messageAnimations.get(item)?.cancel();
  item.classList.remove("system-group-collapsed-item");
  const targetHeight = show ? item.scrollHeight : 0;
  const expandedStyles = getComputedStyle(item);
  const expandedMarginTop = expandedStyles.marginTop;
  const expandedMarginBottom = expandedStyles.marginBottom;
  const toHeight = show ? targetHeight : 0;
  const animation = item.animate(
    [
      {
        height: `${fromHeight}px`,
        opacity: show ? 0 : 1,
        marginTop: fromMarginTop,
        marginBottom: fromMarginBottom,
      },
      {
        height: `${toHeight}px`,
        opacity: show ? 1 : 0,
        marginTop: show ? expandedMarginTop : "0px",
        marginBottom: show ? expandedMarginBottom : "0px",
      },
    ],
    { duration: SYSTEM_GROUP_ANIMATION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  messageAnimations.set(item, animation);

  return new Promise((resolve) => {
    const settle = (completed) => {
      const isCurrentAnimation = messageAnimations.get(item) === animation;
      if (isCurrentAnimation) {
        item.style.removeProperty("height");
        item.style.removeProperty("opacity");
        item.style.removeProperty("margin-top");
        item.style.removeProperty("margin-bottom");
        messageAnimations.delete(item);
        if (completed && !show) item.classList.add("system-group-collapsed-item");
      }
      resolve();
    };

    animation.finished.then(
      () => settle(true),
      () => settle(false),
    );
  });
}

function getChevronMarkup(expanded) {
  const path = expanded ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
}

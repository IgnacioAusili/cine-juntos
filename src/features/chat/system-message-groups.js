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
    const anchorItem = getToggleAnchorItem(expandedToggle) || candidate.at(-1);
    syncSystemGroupTogglePosition(expandedToggle, container, anchorItem);
    containerStates.set(container, current);
    return;
  }

  const isAlreadyCollapsed = current.collapsed;
  if (isAlreadyCollapsed) {
    updateCollapsedState(candidate);
    current.timer = null;
    containerStates.set(container, current);
    return;
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
  const targets = items.length
    ? items
    : Array.from(container?.querySelectorAll(".message.system-group-collapsed-item, .message.system-group-last, .message.system-group-toggle-host") || []);
  targets.forEach((item) => {
    item.classList.remove("system-group-collapsed-item", "system-group-last", "system-group-toggle-host");
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
  items.forEach((item) => item.classList.remove("system-group-toggle-host"));
  const toggleAnchorItem = getSystemGroupToggleAnchorItem(items);
  toggleAnchorItem?.classList.add("system-group-toggle-host");
  const animations = hiddenItems.map((item) => {
    if (animate) return animateMessage(item, false, { preserveItemOpacity: item === toggleAnchorItem });
    item.classList.add("system-group-collapsed-item");
    return null;
  });
  visibleItem.classList.remove("system-group-collapsed-item");
  syncSystemGroupLastMarker(items);

  const appendToggle = () => {
    const latest = container ? getLatestSystemStreak(container).at(-1) : null;
    if (
      !visibleItem.isConnected ||
      !toggleAnchorItem?.isConnected ||
      latest !== visibleItem ||
      collapseRuns.get(container) !== runId
    )
      return;

    const hiddenCount = getSystemGroupHiddenCount(items);
    if (!hiddenCount) return;
    const toggle = container?.querySelector(".system-group-toggle") || document.createElement("button");
    toggle.type = "button";
    toggle.className = "system-group-toggle";
    toggle.setAttribute("aria-expanded", "false");
    updateToggleCount(toggle, hiddenCount, false);
    toggle.onpointerdown = (event) => event.stopPropagation();
    toggle.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSystemGroup(items, toggle);
    };
    const row = toggleAnchorItem.querySelector(".system-message-row");
    if (!row) return;
    row.append(toggle);
    syncSystemGroupTogglePosition(toggle, container, toggleAnchorItem);
    window.requestAnimationFrame(() => {
      if (toggle.isConnected && toggleAnchorItem.isConnected) {
        syncSystemGroupTogglePosition(toggle, container, toggleAnchorItem);
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

  currentItems.forEach((item) => item.classList.remove("system-group-toggle-host"));
  const toggleAnchorItem = getSystemGroupToggleAnchorItem(currentItems);
  toggleAnchorItem?.classList.add("system-group-toggle-host");
  if (nextExpanded) syncSystemGroupTogglePosition(toggle, container, toggleAnchorItem);

  const animations = currentItems.slice(0, -1).map((item) => {
    if (isExpanded) {
      return animateMessage(item, false, { preserveItemOpacity: item === toggleAnchorItem });
    } else {
      return animateMessage(item, true, { preserveItemOpacity: item === toggleAnchorItem });
    }
  });
  const state = containerStates.get(container);
  if (state) state.collapsed = !isExpanded;

  Promise.all(animations).then(() => {
    if (!toggle.isConnected) return;
    const latestItems = container ? getLatestSystemStreak(container) : currentItems;
    const latestAnchorItem = getSystemGroupToggleAnchorItem(latestItems) || toggleAnchorItem || currentItems[0] || items[0];
    updateToggleCount(toggle, getSystemGroupHiddenCount(latestItems), nextExpanded);
    syncSystemGroupLastMarker(latestItems);
    syncSystemGroupTogglePosition(toggle, container, latestAnchorItem);
    if (wasPinnedToBottom) queuePinnedChatScrollSync(container, container === dom.overlayMessages, true);
  });
}

function updateCollapsedState(items) {
  const visibleItem = items.at(-1);
  if (!visibleItem) return;

  const container = visibleItem.parentElement;
  const wasPinnedToBottom = isPinnedToBottom(container);
  const existingToggle = container?.querySelector('.system-group-toggle[aria-expanded="false"]');
  const existingAnchor = getToggleAnchorItem(existingToggle);
  const toggleAnchorItem = items.includes(existingAnchor) ? existingAnchor : getSystemGroupToggleAnchorItem(items);
  if (!toggleAnchorItem) return;

  items.forEach((item) => {
    stopMessageAnimation(item);
    item.classList.toggle("system-group-toggle-host", item === toggleAnchorItem);
    item.classList.toggle("system-group-collapsed-item", item !== visibleItem);
  });
  visibleItem.classList.remove("system-group-collapsed-item");
  syncSystemGroupLastMarker(items);

  const hiddenCount = getSystemGroupHiddenCount(items);
  if (!hiddenCount) return;
  const toggle = existingToggle || document.createElement("button");
  toggle.type = "button";
  toggle.className = "system-group-toggle";
  toggle.setAttribute("aria-expanded", "false");
  updateToggleCount(toggle, hiddenCount, false);
  toggle.onpointerdown = (event) => event.stopPropagation();
  toggle.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSystemGroup(items, toggle);
  };

  const row = toggleAnchorItem.querySelector(".system-message-row");
  if (row && toggle.parentElement !== row) row.append(toggle);
  syncSystemGroupTogglePosition(toggle, container, toggleAnchorItem);
  if (wasPinnedToBottom) queuePinnedChatScrollSync(container, container === dom.overlayMessages, true);
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

function getSystemGroupToggleAnchorItem(items) {
  return items[0] || null;
}

function getToggleAnchorItem(toggle) {
  return toggle?.closest(".message.system") || null;
}

function positionSystemGroupToggle(toggle, container, visibleItem, options = {}) {
  syncSystemGroupTogglePosition(toggle, container, visibleItem, options);
}

function syncSystemGroupTogglePosition(toggle, container, visibleItem, options = {}) {
  const row = visibleItem.querySelector(".system-message-row");
  if (!row || !container) return;

  const isCollapsed = toggle.getAttribute("aria-expanded") !== "true";
  const visualItem = isCollapsed
    ? getLatestSystemStreak(container).at(-1) || visibleItem
    : visibleItem;
  const bubble = visualItem.querySelector(".message-system-bubble") || visualItem.querySelector(".system-message-row") || row;
  const buttonHeight = Number.parseFloat(getComputedStyle(toggle).height) || 18;
  const buttonWidth = 26;
  const lineGap = 12;
  const rowRect = row.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const decorationLineCenter = bubbleRect.top + bubbleRect.height / 2;
  const top = decorationLineCenter - rowRect.top - buttonHeight / 2;
  const left = bubbleRect.left - rowRect.left - buttonWidth - lineGap;
  if (!options.horizontalOnly) toggle.style.top = `${Math.max(0, top)}px`;
  toggle.style.left = `${Math.max(0, left)}px`;
  toggle.style.right = "auto";
  toggle.style.bottom = "auto";
}

function animateMessage(item, show, options = {}) {
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
  const fromFrame = {
    height: `${fromHeight}px`,
    marginTop: fromMarginTop,
    marginBottom: fromMarginBottom,
  };
  const toFrame = {
    height: `${toHeight}px`,
    marginTop: show ? expandedMarginTop : "0px",
    marginBottom: show ? expandedMarginBottom : "0px",
  };
  const frames = show
    ? [fromFrame, { opacity: 0, offset: 0.18 }, toFrame]
    : [fromFrame, { opacity: 0, offset: 0.46 }, toFrame];
  if (!options.preserveItemOpacity) {
    fromFrame.opacity = show ? 0 : 1;
    toFrame.opacity = show ? 1 : 0;
  } else {
    frames.splice(1, 1);
    animateSystemMessageContent(item, show);
  }
  const animation = item.animate(
    frames,
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

function stopMessageAnimation(item) {
  messageAnimations.get(item)?.cancel();
  item.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  messageAnimations.delete(item);
  item.style.removeProperty("height");
  item.style.removeProperty("opacity");
  item.style.removeProperty("margin-top");
  item.style.removeProperty("margin-bottom");
}

function animateSystemMessageContent(item, show) {
  const targets = item.querySelectorAll(".message-system-bubble, .swipe-reply-hint-wrapper");
  targets.forEach((target) => {
    target.animate(
      show
        ? [{ opacity: 0 }, { opacity: 0, offset: 0.18 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0, offset: 0.46 }, { opacity: 0 }],
      { duration: SYSTEM_GROUP_ANIMATION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  });
}

function getChevronMarkup(expanded) {
  const path = expanded ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
}

import { SYSTEM_GROUP_MIN_SIZE, groupStates, groupTransitions } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";
import { cancelGroupTransition, animateGroupTransition } from "./system-message-group-transitions.js?v=20261010-file-size-refactor-02";
import { getGroupTransitionTarget, prepareCollapseVisualTransition, prepareExpansionVisualTransition } from "./system-message-group-visuals.js?v=20261010-file-size-refactor-02";
import { cancelGroupToggleAnimation, moveGroupToggle } from "./system-message-group-toggle.js?v=20261010-file-size-refactor-02";
import { settleSystemMessageRoll, resetSystemMessageRowAnchor } from "./system-message-roll.js?v=20261010-file-size-refactor-02";

export function getLatestSystemStreak(container) {
  const messages = Array.from(container.children).filter((child) => child.classList.contains("message"));
  let start = messages.length;
  while (start > 0 && messages[start - 1].classList.contains("system")) start -= 1;
  return messages.slice(start);
}

export function getGroupItems(header) {
  const anchor = header?.closest(".message.system");
  return getContiguousSystemItems(anchor);
}

export function getContiguousSystemItems(anchor) {
  if (!anchor?.classList.contains("message") || !anchor.classList.contains("system")) return [];

  const items = [anchor];
  let item = anchor.previousElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.unshift(item);
    item = item.previousElementSibling;
  }

  item = anchor.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }

  return items;
}

export function findGroupToggle(items) {
  return items
    .map((item) => item.querySelector(":scope .system-group-toggle"))
    .find(Boolean) || null;
}

export function clearShortGroup(items) {
  const header = findGroupToggle(items);
  if (header) removeGroupHeader(header);
  items.forEach((item) => {
    settleSystemMessageRoll(item.querySelector(".message-system-text"));
    resetSystemMessageRowAnchor(item);
    item.classList.remove("system-group-collapsed-item", "system-group-last");
  });
}

export function ensureGroupHeader(items) {
  const first = items[0];
  let header = findGroupToggle(items);
  if (!header) {
    header = document.createElement("button");
    header.type = "button";
    header.className = "system-group-toggle";
    header.setAttribute("aria-expanded", "false");
    groupStates.set(header, { expanded: false });
  }
  bindGroupHeader(header, items);
  if (!header.isConnected) moveGroupToggle(header, first);
  return header;
}

export function bindGroupHeader(header, items = getGroupItems(header)) {
  header.onpointerdown = (event) => event.stopPropagation();
  header.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const state = getGroupState(header) || { expanded: header.getAttribute("aria-expanded") === "true" };
    if (groupTransitions.has(header)) return;
    applyGroupState(header, !state.expanded, {
      animate: true,
      preserveSelectorHighlight: event.detail > 0 && header.matches(":hover"),
    });
  };

  items.forEach((item) => {
    item.classList.add("system-group-member");
    item.oncontextmenu = null;
    item.onclick = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select")) {
        return;
      }
      event.stopPropagation();
      if (groupTransitions.has(header) || !header.isConnected) return;
      const state = getGroupState(header) || {
        expanded: header.getAttribute("aria-expanded") === "true",
      };
      applyGroupState(header, !state.expanded, { animate: true });
    };
  });
}

export function applyGroupState(
  header,
  expanded,
  {
    animate = false,
    preserveSelectorHighlight = false,
    animateSelector = true,
  } = {},
) {
  const items = getGroupItems(header);
  if (items.length < SYSTEM_GROUP_MIN_SIZE) {
    removeGroupHeader(header);
    items.forEach((item) => {
      settleSystemMessageRoll(item.querySelector(".message-system-text"));
      resetSystemMessageRowAnchor(item);
      item.classList.remove("system-group-collapsed-item", "system-group-last");
    });
    return;
  }

  const lastItem = items.at(-1);

  cancelGroupTransition(header);
  if (animate && preserveSelectorHighlight) header.classList.add("system-group-transitioning");
  const visualState = animate
    ? expanded
      ? prepareExpansionVisualTransition(lastItem, items)
      : prepareCollapseVisualTransition(items)
    : null;
  // Medir antes de ocultar o mostrar filas conserva la posición visual real
  // del selector. Si se mide después, una fila que acaba de ocultarse devuelve
  // un rectángulo vacío y la animación arranca desde un punto incorrecto.
  const selectorRect = header.isConnected ? header.getBoundingClientRect() : null;

  // Al expandir, cada mensaje vuelve a su posición natural. También se limpia
  // cualquier fila que pase a quedar oculta tras actualizar el grupo.
  items.forEach((item) => {
    if (expanded || item !== lastItem) {
      settleSystemMessageRoll(item.querySelector(".message-system-text"));
      resetSystemMessageRowAnchor(item);
    }
  });

  const state = getGroupState(header) || {};
  state.expanded = Boolean(expanded);
  groupStates.set(header, state);

  applyStructuralGroupState(header, items, expanded, {
    animateSelector,
    selectorRect,
  });

  if (animate) {
    animateGroupTransition(items, header, visualState, expanded);
  }
}

export function applyStructuralGroupState(
  header,
  items,
  expanded,
  { animateSelector = false, selectorRect = null } = {},
) {
  const firstItem = items[0];
  const lastItem = items.at(-1);
  const visibleItem = expanded ? null : items.at(-1);
  const hiddenItems = items.slice(0, -1);

  // El layout adopta siempre el estado definitivo antes de mover el selector.
  // La contracción mantiene la imagen anterior en una capa temporal para que
  // este cambio estructural no haga desaparecer las filas de golpe.
  hiddenItems.forEach((item) => item.classList.toggle("system-group-collapsed-item", !expanded));

  if (visibleItem) visibleItem.classList.remove("system-group-collapsed-item");
  items.forEach((item) => item.classList.toggle("system-group-last", item === visibleItem));
  header.setAttribute("aria-expanded", String(Boolean(expanded)));
  updateHeader(header, items.length - 1, Boolean(expanded));

  moveGroupToggle(header, expanded ? firstItem : lastItem, {
    animate: animateSelector,
    previousRect: selectorRect,
  });
}

export function removeGroupHeader(header) {
  if (!header) return;
  cancelGroupToggleAnimation(header);
  cancelGroupTransition(header);
  window.clearTimeout(getGroupState(header)?.timer);
  groupStates.delete(header);
  header.remove();
}

export function getGroupState(header) {
  return header ? groupStates.get(header) : null;
}

export function updateHeader(header, hiddenCount, expanded) {
  header.setAttribute(
    "aria-label",
    `${expanded ? "Ocultar" : "Mostrar"} ${hiddenCount} mensajes de sincronización`,
  );
  header.innerHTML = `${getChevronMarkup(expanded)}<span class="system-group-toggle-count">${hiddenCount}</span>`;
}

export function getChevronMarkup(expanded) {
  const path = expanded ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
}

export function captureSystemTextSnapshot(item) {
  const target = item?.querySelector(".message-system-text");
  const bubble = item?.querySelector(".message-system-bubble");
  const row = item?.querySelector(".system-message-row");
  if (!target) return null;
  return {
    markup: target.cloneNode(true),
    rect: target.getBoundingClientRect(),
    bubbleRect: bubble?.getBoundingClientRect() || null,
    rowRect: row?.getBoundingClientRect() || null,
  };
}

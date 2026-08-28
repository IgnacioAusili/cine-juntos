import {
  animateCollapsedSystemMessageAdvance,
  settleSystemMessageRoll,
} from "./system-message-roll.js?v=20260823-system-message-drum-09";

const SYSTEM_GROUP_MIN_SIZE = 3;
const SYSTEM_GROUP_TRANSITION_MS = 180;
const SYSTEM_GROUP_EXPANSION_MS = SYSTEM_GROUP_TRANSITION_MS;
const SYSTEM_GROUP_EXPANSION_STAGGER_MS = 14;
const SYSTEM_GROUP_SCROLL_EDGE_GAP = 56;
const SYSTEM_GROUP_TOGGLE_TRANSITION_MS = 180;
const SYSTEM_GROUP_REMOVAL_MS = 380;
const SYSTEM_GROUP_ENTRY_OFFSET_X = 28;
const SYSTEM_GROUP_ENTRY_ROTATION = 1.5;
const groupStates = new WeakMap();
const groupTransitions = new WeakMap();
const groupToggleAnimations = new WeakMap();

/**
 * Agrupa la última racha de mensajes de sistema. Cada selector pertenece al
 * mensaje que representa, por lo que el layout lo mueve junto con esa fila.
 */
export function scheduleSystemMessageCollapse(container, { animateIncoming = false } = {}) {
  if (!container) return;

  const items = getLatestSystemStreak(container);
  if (items.length < SYSTEM_GROUP_MIN_SIZE) {
    // Un mensaje de usuario termina la racha actual, pero no debe desarmar ni
    // cancelar el grupo anterior.
    if (items.length) clearShortGroup(items);
    return;
  }

  const hadExistingHeader = Boolean(findGroupToggle(items)?.isConnected);
  const header = ensureGroupHeader(items);
  const state = getGroupState(header);
  const wasExpanded = state?.expanded === true;
  const previousVisibleItem = hadExistingHeader && state?.expanded === false
    ? header.closest(".message.system")
    : null;
  settleSystemMessageRoll(previousVisibleItem?.querySelector(".message-system-text"));
  const previousSnapshot = animateIncoming && previousVisibleItem && !groupTransitions.has(header)
    ? captureSystemTextSnapshot(previousVisibleItem)
    : null;
  applyGroupState(header, state?.expanded ?? false);

  if (previousSnapshot) {
    animateCollapsedSystemMessageAdvance(
      previousSnapshot,
      items.at(-1)?.querySelector(".message-system-text"),
    );
  }

  if (animateIncoming && hadExistingHeader && wasExpanded) {
    animateExpandedSystemMessageEntry(items.at(-1));
  }
}

/**
 * Reancla el selector antes de eliminar su mensaje anfitrión. El reanclaje
 * puede diferirse hasta la misma tarea que retira la fila para no pintar un
 * estado intermedio en el que el selector salta a otra posición.
 */
export function prepareSystemMessageRemoval(container, item, { deferReanchor = false } = {}) {
  if (!container || !item?.classList.contains("system")) return null;

  const header = findGroupToggle(getContiguousSystemItems(item));
  if (!header) return null;

  // En un grupo contraído el selector vive en la última fila visible, no en
  // el mensaje más antiguo que está por salir (que permanece oculto). En ese
  // caso no hay que moverlo a la siguiente fila oculta: hacerlo provoca el
  // parpadeo que se ve durante la limpieza del grupo.
  if (header.closest(".message.system") !== item) return header;

  const nextItem = item.nextElementSibling;
  if (!nextItem?.classList.contains("message") || !nextItem.classList.contains("system")) {
    removeGroupHeader(header);
    return null;
  }

  if (!deferReanchor) moveGroupToggle(header, nextItem);
  return header;
}

/** Reaplica el estado de un grupo después de retirar uno de sus mensajes. */
export function refreshSystemMessageGroup(header) {
  if (!header?.isConnected) return;
  const state = getGroupState(header);
  applyGroupState(header, state?.expanded ?? header.getAttribute("aria-expanded") === "true");
}

/** Captura las posiciones del resto del grupo antes de retirar una fila expandida. */
export function captureExpandedSystemMessageRemoval(item, header) {
  if (
    !item?.classList.contains("message")
    || !item.classList.contains("system")
    || header?.getAttribute("aria-expanded") !== "true"
  ) return null;

  const entries = getContiguousSystemItems(item)
    .filter((groupItem) => groupItem !== item)
    .map((groupItem) => {
      const target = getGroupTransitionTarget(groupItem);
      return target
        ? { target, rect: target.getBoundingClientRect() }
        : null;
    })
    .filter(Boolean);

  if (!entries.length) return null;

  return {
    entries,
  };
}

/** Anima la salida lateral y el reacomodo vertical de un grupo expandido. */
export function animateExpandedSystemMessageRemoval(visualState) {
  if (!visualState || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const animations = [];
  visualState.entries.forEach((entry) => {
    if (!entry.target.isConnected) return;

    const finalRect = entry.target.getBoundingClientRect();
    const deltaY = entry.rect.top - finalRect.top;
    if (Math.abs(deltaY) < 0.5) return;

    const animation = entry.target.animate(
      [
        {
          transform: `translate3d(0, ${deltaY}px, 0)`,
        },
        {
          transform: "translate3d(0, 0, 0)",
        },
      ],
      {
        duration: SYSTEM_GROUP_REMOVAL_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animations.push(animation);
  });

  animations.forEach((animation) => {
    animation.finished.then(() => animation.cancel(), () => animation.cancel());
  });
}

/** Hace entrar desde el lateral el mensaje nuevo de un grupo expandido. */
export function animateExpandedSystemMessageEntry(item) {
  if (!item?.isConnected || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const target = getGroupTransitionTarget(item);
  if (!target) return;

  const animation = target.animate(
    [
      {
        opacity: 0,
        transform: `translate3d(${SYSTEM_GROUP_ENTRY_OFFSET_X}px, 0, 0) rotate(${SYSTEM_GROUP_ENTRY_ROTATION}deg)`,
      },
      {
        opacity: 1,
        transform: "translate3d(0, 0, 0) rotate(0deg)",
      },
    ],
    {
      duration: SYSTEM_GROUP_REMOVAL_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );

  animation.finished.then(() => animation.cancel(), () => animation.cancel());
}

/** Expande el grupo solo cuando el mensaje objetivo está oculto. */
export function expandSystemMessageGroupForItem(item) {
  if (!item?.classList.contains("message") || !item.classList.contains("system")) return null;
  if (!item.classList.contains("system-group-collapsed-item")) return null;

  const items = getContiguousSystemItems(item);
  const header = findGroupToggle(items);
  if (!header || item === items.at(-1)) return null;

  const state = getGroupState(header) || {
    expanded: header.getAttribute("aria-expanded") === "true",
  };
  if (state.expanded) return null;

  applyGroupState(header, true, { animate: true });
  return groupTransitions.get(header)?.finished || Promise.resolve();
}

function getLatestSystemStreak(container) {
  const messages = Array.from(container.children).filter((child) => child.classList.contains("message"));
  let start = messages.length;
  while (start > 0 && messages[start - 1].classList.contains("system")) start -= 1;
  return messages.slice(start);
}

function getGroupItems(header) {
  const anchor = header?.closest(".message.system");
  return getContiguousSystemItems(anchor);
}

function getContiguousSystemItems(anchor) {
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

function findGroupToggle(items) {
  return items
    .map((item) => item.querySelector(":scope .system-group-toggle"))
    .find(Boolean) || null;
}

function clearShortGroup(items) {
  const header = findGroupToggle(items);
  if (header) removeGroupHeader(header);
  items.forEach((item) => item.classList.remove("system-group-collapsed-item", "system-group-last"));
}

function ensureGroupHeader(items) {
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

function captureSystemTextSnapshot(item) {
  const target = item?.querySelector(".message-system-text");
  if (!target) return null;
  return {
    markup: target.cloneNode(true),
    rect: target.getBoundingClientRect(),
  };
}

function bindGroupHeader(header, items = getGroupItems(header)) {
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

function applyGroupState(
  header,
  expanded,
  { animate = false, preserveSelectorHighlight = false } = {},
) {
  const items = getGroupItems(header);
  if (items.length < SYSTEM_GROUP_MIN_SIZE) {
    removeGroupHeader(header);
    items.forEach((item) => item.classList.remove("system-group-collapsed-item", "system-group-last"));
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

  const state = getGroupState(header) || {};
  state.expanded = Boolean(expanded);
  groupStates.set(header, state);

  applyStructuralGroupState(header, items, expanded, {
    animateSelector: true,
    selectorRect,
  });

  if (animate) {
    animateGroupTransition(items, header, visualState, expanded);
  }
}

function applyStructuralGroupState(
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

function prepareExpansionVisualTransition(anchor, items) {
  const target = getGroupTransitionTarget(anchor);
  if (!target) return null;

  const state = {
    target,
    anchorRect: target.getBoundingClientRect(),
    opacity: target.style.opacity,
    transform: target.style.transform,
    layoutEntries: captureLayoutEntries(items),
    scrollState: captureScrollState(items),
  };
  return state;
}

function prepareCollapseVisualTransition(items) {
  const container = items[0]?.parentElement;
  const entries = items
    .map((item) => {
      const target = getGroupTransitionTarget(item);
      if (!target) return null;
      return {
        item,
        target,
        rect: target.getBoundingClientRect(),
        opacity: target.style.opacity,
        transform: target.style.transform,
      };
    })
    .filter(Boolean);

  if (!entries.length) return null;

  const layoutEntries = captureLayoutEntries(items, container);

  const layer = document.createElement("div");
  layer.className = "system-group-transition-layer";
  layer.setAttribute("aria-hidden", "true");
  const containerRect = container?.getBoundingClientRect();
  Object.assign(layer.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: `${Math.max(container?.scrollHeight || 0, container?.clientHeight || 0)}px`,
    zIndex: "20",
    pointerEvents: "none",
  });

  const visualEntries = entries.map((entry) => {
    // La burbuja necesita conservar los ancestros de un mensaje de sistema:
    // fuera de `.message.system` cae en los estilos genéricos de burbuja y
    // aparece como un panel redondeado durante la transición.
    const clone = entry.target.cloneNode(true);
    const row = document.createElement("div");
    row.className = "message-bubble-row system-message-row";
    const shell = document.createElement("article");
    shell.className = "message system";
    row.append(clone);
    shell.append(row);
    const { rect } = entry;
    const left = rect.left - (containerRect?.left || 0) + (container?.scrollLeft || 0);
    const top = rect.top - (containerRect?.top || 0) + (container?.scrollTop || 0);
    Object.assign(clone.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      maxWidth: "none",
      boxSizing: "border-box",
      margin: "0",
      opacity: "1",
      transform: "none",
      pointerEvents: "none",
    });
    Object.assign(shell.style, {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      pointerEvents: "none",
    });
    layer.append(shell);
    entry.target.style.opacity = "0";
    return { ...entry, clone: shell };
  });

  // Mantener la capa dentro del contenedor original conserva las reglas de
  // ancho específicas de #messages y #overlayMessages. Las coordenadas se
  // expresan en el espacio scrolleable del contenedor, no en el viewport.
  (items[0]?.parentElement || document.body).append(layer);
  return { entries: visualEntries, layoutEntries, layer, scrollState: captureScrollState(items) };
}

function captureLayoutEntries(items, container = items[0]?.parentElement) {
  return Array.from(container?.children || [])
    .filter((item) => item.classList.contains("message") && !items.includes(item))
    .map((item) => ({
      item,
      rect: item.getBoundingClientRect(),
    }));
}

function captureScrollState(items) {
  const container = items[0]?.parentElement;
  const lastItem = items.at(-1);
  if (!container || !lastItem) return null;

  const containerRect = container.getBoundingClientRect();
  const lastRect = lastItem.getBoundingClientRect();
  const distanceFromScrollEnd = container.scrollHeight - container.scrollTop - container.clientHeight;
  const distanceFromViewportEdge = containerRect.bottom - lastRect.bottom;
  if (
    distanceFromViewportEdge > SYSTEM_GROUP_SCROLL_EDGE_GAP &&
    distanceFromScrollEnd > SYSTEM_GROUP_SCROLL_EDGE_GAP
  ) return null;

  return {
    container,
    lastBottom: lastRect.bottom,
  };
}

function animateGroupTransition(items, header, visualState, expanded) {
  const animations = [];
  const transitionDuration = expanded ? SYSTEM_GROUP_EXPANSION_MS : SYSTEM_GROUP_TRANSITION_MS;

  if (!expanded && visualState?.entries) {
    const finalTarget = getGroupTransitionTarget(items.at(-1));
    const finalRect = finalTarget?.getBoundingClientRect();

    visualState.entries.forEach((entry) => {
      const isLastItem = entry.item === items.at(-1);
      const deltaX = isLastItem && finalRect ? finalRect.left - entry.rect.left : 0;
      const deltaY = isLastItem && finalRect ? finalRect.top - entry.rect.top : -5;
      const animation = entry.clone.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
          {
            opacity: isLastItem ? 1 : 0,
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`,
          },
        ],
        {
          duration: SYSTEM_GROUP_TRANSITION_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      animations.push(animation);
    });
  }

  if (visualState?.layoutEntries) {
    visualState.layoutEntries.forEach((entry) => {
      if (!entry.item.isConnected) return;
      const finalRect = entry.item.getBoundingClientRect();
      const deltaY = entry.rect.top - finalRect.top;
      const deltaX = entry.rect.left - finalRect.left;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      const animation = entry.item.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: transitionDuration,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      animations.push(animation);
    });
  }

  const scrollAnimation = createGroupScrollAnimation(visualState?.scrollState, items, transitionDuration);

  items.forEach((item, index) => {
    if (!expanded) return;
    const animationTarget = getGroupTransitionTarget(item);
    if (!animationTarget) return;

    const isAnchor = item === items.at(-1);
    const finalRect = animationTarget.getBoundingClientRect();
    const anchorRect = visualState?.anchorRect;
    const deltaX = isAnchor && anchorRect ? anchorRect.left - finalRect.left : 0;
    const deltaY = isAnchor && anchorRect ? anchorRect.top - finalRect.top : -5;
    const delay = isAnchor ? 0 : index * SYSTEM_GROUP_EXPANSION_STAGGER_MS;

    const animation = animationTarget.animate(
      [
        {
          opacity: isAnchor ? 1 : 0,
          transform: `translate3d(${isAnchor ? deltaX : 0}px, ${deltaY}px, 0)`,
        },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: SYSTEM_GROUP_EXPANSION_MS,
        delay,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animations.push(animation);
  });

  const finished = Promise.all([
    ...animations.map((animation) => animation.finished.catch(() => undefined)),
    scrollAnimation?.finished,
  ]);
  const transition = {
    animations,
    scrollAnimation,
    finished,
    cleanup: () => {
      // Las animaciones de expansión usan `fill: both` para sostener las
      // filas durante el stagger. Al terminar hay que quitarlas del elemento;
      // si quedan adheridas, interfieren con la siguiente contracción y dejan
      // una copia visual tenue de los mensajes anteriores.
      animations.forEach((animation) => animation.cancel());
      restoreExpansionVisualTransition(visualState);
      visualState?.layer?.remove();
      scrollAnimation?.cancel();
      header.classList.remove("system-group-transitioning");
      items.forEach((item) => item.classList.remove("system-group-transitioning"));
    },
  };
  items.forEach((item) => item.classList.add("system-group-transitioning"));
  groupTransitions.set(header, transition);
  finished.then(() => {
    if (groupTransitions.get(header) !== transition || !header.isConnected) return;
    transition.cleanup();
    groupTransitions.delete(header);
  });
}

function createGroupScrollAnimation(scrollState, items, duration) {
  if (!scrollState?.container) return null;

  const { container, lastBottom } = scrollState;
  const lastRect = items.at(-1)?.getBoundingClientRect();
  if (!lastRect) return null;

  // Ocultar filas puede hacer que el navegador ajuste scrollTop por su cuenta
  // antes de este punto. Animar desde el valor capturado antes del reflow
  // produciría un salto hacia abajo; el valor actual es la posición visual
  // real desde la que debe continuar la transición.
  const startScrollTop = container.scrollTop;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetScrollTop = Math.min(
    maxScrollTop,
    Math.max(0, startScrollTop + lastRect.bottom - lastBottom),
  );
  if (Math.abs(targetScrollTop - startScrollTop) < 0.5) return null;

  let frameId = 0;
  let cancelled = false;
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  const startedAt = performance.now();

  const tick = (now) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    container.scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * eased;
    if (progress < 1) {
      frameId = window.requestAnimationFrame(tick);
    } else {
      resolveFinished();
    }
  };

  frameId = window.requestAnimationFrame(tick);
  return {
    finished,
    cancel: () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resolveFinished?.();
    },
  };
}

function getGroupTransitionTarget(item) {
  return item?.querySelector(".message-system-bubble")
    || item?.querySelector(".system-message-row")
    || item;
}

function restoreExpansionVisualTransition(state) {
  if (state?.target) {
    state.target.style.opacity = state.opacity;
    state.target.style.transform = state.transform;
  }
  state?.entries?.forEach((entry) => {
    entry.target.style.opacity = entry.opacity;
    entry.target.style.transform = entry.transform;
  });
}

function cancelGroupTransition(header) {
  const transition = groupTransitions.get(header);
  if (!transition) return;
  transition.frameIds?.forEach((frameId) => window.cancelAnimationFrame(frameId));
  transition.animations.forEach((animation) => animation.cancel());
  transition.cleanup?.();
  transition.layer?.remove();
  groupTransitions.delete(header);
}

function moveGroupToggle(header, anchor, { animate = false, previousRect = null } = {}) {
  if (!header || !anchor?.isConnected) return;

  const fromRect = animate
    ? previousRect || (header.isConnected ? header.getBoundingClientRect() : null)
    : null;
  cancelGroupToggleAnimation(header);
  const row = anchor.querySelector(".system-message-row") || anchor;
  if (header.parentElement !== row) row.append(header);
  header.style.removeProperty("top");
  header.style.removeProperty("left");
  header.style.removeProperty("right");

  if (!fromRect || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const nextRect = header.getBoundingClientRect();
  const deltaY = fromRect.top - nextRect.top;
  if (Math.abs(deltaY) < 0.5) return;

  const animation = header.animate(
    [
      { transform: `translateY(calc(-50% + ${deltaY}px))` },
      { transform: "translateY(-50%)" },
    ],
    {
      duration: SYSTEM_GROUP_TOGGLE_TRANSITION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
  groupToggleAnimations.set(header, animation);
  const cleanup = () => {
    if (groupToggleAnimations.get(header) !== animation) return;
    animation.cancel();
    groupToggleAnimations.delete(header);
  };
  animation.finished.then(cleanup, cleanup);
}

function cancelGroupToggleAnimation(header) {
  const animation = groupToggleAnimations.get(header);
  if (!animation) return;
  animation.cancel();
  groupToggleAnimations.delete(header);
}

function removeGroupHeader(header) {
  if (!header) return;
  cancelGroupToggleAnimation(header);
  cancelGroupTransition(header);
  window.clearTimeout(getGroupState(header)?.timer);
  groupStates.delete(header);
  header.remove();
}

function getGroupState(header) {
  return header ? groupStates.get(header) : null;
}

function updateHeader(header, hiddenCount, expanded) {
  header.setAttribute(
    "aria-label",
    `${expanded ? "Ocultar" : "Mostrar"} ${hiddenCount} mensajes de sincronización`,
  );
  header.innerHTML = `${getChevronMarkup(expanded)}<span class="system-group-toggle-count">${hiddenCount}</span>`;
}

function getChevronMarkup(expanded) {
  const path = expanded ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
}

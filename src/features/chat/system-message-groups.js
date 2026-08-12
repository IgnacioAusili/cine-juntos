const SYSTEM_GROUP_MIN_SIZE = 3;
const SYSTEM_GROUP_IDLE_MS = 3200;
const SYSTEM_GROUP_ANIMATION_MS = 240;
const groupStates = new WeakMap();
const headerObservers = new WeakMap();
const itemAnimations = new WeakMap();
const headerAnimationRuns = new WeakMap();

/**
 * Agrupa la última racha de mensajes de sistema. El selector es un hermano
 * propio de los mensajes, nunca contenido de uno de ellos: así el primer
 * mensaje puede desaparecer sin desplazar ni destruir el selector.
 */
export function scheduleSystemMessageCollapse(container) {
  if (!container) return;

  const items = getLatestSystemStreak(container);
  if (items.length < SYSTEM_GROUP_MIN_SIZE) {
    // Un mensaje de usuario termina la racha actual, pero no debe desarmar ni
    // cancelar el menú de la racha anterior.
    if (items.length) clearShortGroup(container, items);
    return;
  }

  const header = ensureGroupHeader(container, items);
  const expanded = header.getAttribute("aria-expanded") === "true";
  applyGroupState(header, expanded);

  const state = groupStates.get(container) || { timer: 0 };
  window.clearTimeout(state.timer);
  state.timer = 0;
  if (expanded) {
    state.timer = window.setTimeout(() => {
      // La racha puede haber dejado de ser la última si llegó un mensaje de
      // usuario; el encabezado todavía identifica de forma estable su grupo.
      if (!header.isConnected || header.getAttribute("aria-expanded") !== "true") return;
      applyGroupState(header, false, { animate: true });
    }, SYSTEM_GROUP_IDLE_MS);
  }
  groupStates.set(container, state);
}

/**
 * Limpia solamente un selector que pertenezca al mensaje que se va a borrar.
 * Si hay más mensajes de sistema detrás, el selector queda exactamente donde
 * estaba y pasa a preceder al nuevo primero de forma natural en el DOM.
 */
export function prepareSystemMessageRemoval(container, item) {
  if (!container || !item?.classList.contains("system")) return null;

  const header = item.previousElementSibling;
  if (!header?.classList.contains("system-group-toggle")) return null;
  if (!item.nextElementSibling?.classList.contains("system")) {
    removeGroupHeader(header);
    return null;
  }
  return header;
}

/** Reancla la cabecera una vez que su antiguo primer mensaje ya no existe. */
export function refreshSystemMessageGroup(header) {
  if (!header?.isConnected) return;
  applyGroupState(header, header.getAttribute("aria-expanded") === "true");
}

function getLatestSystemStreak(container) {
  const messages = Array.from(container.children).filter((child) => child.classList.contains("message"));
  let start = messages.length;
  while (start > 0 && messages[start - 1].classList.contains("system")) start -= 1;
  return messages.slice(start);
}

function getGroupItems(header) {
  const items = [];
  let item = header?.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }
  return items;
}

function clearShortGroup(container, items) {
  const first = items[0];
  const header = first?.previousElementSibling;
  if (header?.classList.contains("system-group-toggle")) removeGroupHeader(header);
  items.forEach((item) => item.classList.remove("system-group-collapsed-item", "system-group-last"));

  const state = groupStates.get(container);
  if (state) {
    window.clearTimeout(state.timer);
    state.timer = 0;
  }
}

function ensureGroupHeader(container, items) {
  const first = items[0];
  let header = first.previousElementSibling;
  if (!header?.classList.contains("system-group-toggle")) {
    header = document.createElement("button");
    header.type = "button";
    header.className = "system-group-toggle";
    header.setAttribute("aria-expanded", "true");
    container.insertBefore(header, first);
  }
  bindGroupHeader(header, container);
  return header;
}

function bindGroupHeader(header, container) {
  header.onpointerdown = (event) => event.stopPropagation();
  header.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const expanded = header.getAttribute("aria-expanded") !== "true";
    applyGroupState(header, expanded, { animate: true });

    const state = groupStates.get(container);
    if (state) {
      window.clearTimeout(state.timer);
      state.timer = 0;
    }
  };
}

function applyGroupState(header, expanded, { animate = false } = {}) {
  const items = getGroupItems(header);
  if (items.length < SYSTEM_GROUP_MIN_SIZE) {
    removeGroupHeader(header);
    items.forEach((item) => item.classList.remove("system-group-collapsed-item", "system-group-last"));
    return;
  }

  const container = header.parentElement;
  // Contraído: queda junto al último aviso visible. Expandido: vuelve al
  // primero, que ocupa la misma altura visual en la que se pulsó el selector.
  // Así el botón no salta verticalmente al abrir o cerrar el grupo.
  const firstItem = items[0];
  const lastItem = items.at(-1);
  const visibleItem = lastItem;
  const positionAnchor = expanded ? firstItem : lastItem;
  const hiddenItems = items.filter((item) => item !== visibleItem);
  const animationRun = (headerAnimationRuns.get(header) || 0) + 1;
  headerAnimationRuns.set(header, animationRun);

  if (animate) {
    header.dataset.groupAnimating = "true";
    if (expanded) {
      hiddenItems.forEach((item) => item.classList.remove("system-group-collapsed-item"));
      animateGroupItems(hiddenItems, true);
      trackExpandedGroupScroll(header, container, lastItem, animationRun);
    } else {
      animateGroupItems(hiddenItems, false);
    }
  } else {
    hiddenItems.forEach(stopItemAnimation);
    hiddenItems.forEach((item) => item.classList.toggle("system-group-collapsed-item", !expanded));
  }
  visibleItem.classList.remove("system-group-collapsed-item");
  items.forEach((item) => item.classList.toggle("system-group-last", item === visibleItem));
  header.setAttribute("aria-expanded", String(expanded));
  updateHeader(header, items.length - 1, expanded);
  watchGroupHeader(header, container, positionAnchor);
  if (animate) {
    window.setTimeout(() => {
      if (headerAnimationRuns.get(header) !== animationRun || !header.isConnected) return;
      delete header.dataset.groupAnimating;
      positionGroupHeader(header, positionAnchor);
    }, SYSTEM_GROUP_ANIMATION_MS);
  } else {
    delete header.dataset.groupAnimating;
    positionGroupHeader(header, positionAnchor);
  }
}

/** Mantiene visible el final del grupo mientras la expansión agrega altura. */
function trackExpandedGroupScroll(header, container, lastItem, animationRun) {
  if (!container || !lastItem) return;

  const startedAt = performance.now();
  const follow = () => {
    if (!header.isConnected || !container.isConnected || !lastItem.isConnected || headerAnimationRuns.get(header) !== animationRun) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const itemRect = lastItem.getBoundingClientRect();
    const overflowBottom = itemRect.bottom - containerRect.bottom;
    if (overflowBottom > 0.5) container.scrollTop += overflowBottom;

    if (performance.now() - startedAt < SYSTEM_GROUP_ANIMATION_MS + 64) {
      window.requestAnimationFrame(follow);
    }
  };

  window.requestAnimationFrame(follow);
}

function animateGroupItems(items, expanded) {
  items.forEach((item) => {
    stopItemAnimation(item);
    const currentStyle = getComputedStyle(item);
    const height = item.getBoundingClientRect().height || item.scrollHeight;
    const from = expanded
      ? { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0, transform: "translateY(-4px)" }
      : {
          height: `${height}px`,
          marginTop: currentStyle.marginTop,
          marginBottom: currentStyle.marginBottom,
          opacity: 1,
          transform: "translateY(0)",
        };
    const to = expanded
      ? {
          height: `${height}px`,
          marginTop: currentStyle.marginTop,
          marginBottom: currentStyle.marginBottom,
          opacity: 1,
          transform: "translateY(0)",
        }
      : { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0, transform: "translateY(-4px)" };
    const animation = item.animate([from, to], {
      duration: SYSTEM_GROUP_ANIMATION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    });
    itemAnimations.set(item, animation);
    const settle = () => {
      if (itemAnimations.get(item) !== animation) return;
      if (!expanded) item.classList.add("system-group-collapsed-item");
      // `fill: both` mantiene el último fotograma (altura 0 al contraer).
      // Al cancelarlo después de fijar el estado CSS, el mensaje recupera
      // su alto natural cuando se vuelve a expandir.
      animation.cancel();
      itemAnimations.delete(item);
    };
    animation.finished.then(settle, () => undefined);
    // Respaldo: algunos ciclos de reflow interrumpen la promesa `finished`
    // sin cancelar la animación. Nunca dejamos un fotograma de altura cero.
    window.setTimeout(settle, SYSTEM_GROUP_ANIMATION_MS + 32);
  });
}

function stopItemAnimation(item) {
  itemAnimations.get(item)?.cancel();
  itemAnimations.delete(item);
}

function watchGroupHeader(header, container, firstItem) {
  headerObservers.get(header)?.disconnect();
  const observer = new ResizeObserver(() => {
    if (header.dataset.groupAnimating === "true") return;
    positionGroupHeader(header, firstItem);
  });
  observer.observe(container);
  observer.observe(firstItem);
  headerObservers.set(header, observer);
}

function removeGroupHeader(header) {
  headerObservers.get(header)?.disconnect();
  headerObservers.delete(header);
  header.remove();
}

function positionGroupHeader(header, firstItem) {
  if (!header?.isConnected || !firstItem?.isConnected) return;

  const container = header.parentElement;
  const row = firstItem.querySelector(".system-message-row");
  const bubble = firstItem.querySelector(".message-system-bubble") || row;
  if (!container || !row || !bubble) return;

  const containerRect = container.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const buttonWidth = header.offsetWidth || 26;
  const buttonHeight = header.offsetHeight || 18;
  const gap = 18;
  const top = bubbleRect.top - containerRect.top + container.scrollTop + (bubbleRect.height - buttonHeight) / 2;
  const left = bubbleRect.left - containerRect.left + container.scrollLeft - buttonWidth - gap;

  header.style.top = `${Math.max(0, top)}px`;
  header.style.left = `${Math.max(4, left)}px`;
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

import { SYSTEM_GROUP_SCROLL_EDGE_GAP } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";

export function prepareExpansionVisualTransition(anchor, items) {
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
export function prepareCollapseVisualTransition(items) {
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
export function getGroupTransitionTarget(item) {
  return item?.querySelector(".message-system-bubble")
    || item?.querySelector(".system-message-row")
    || item;
}

export function restoreExpansionVisualTransition(state) {
  if (state?.target) {
    state.target.style.opacity = state.opacity;
    state.target.style.transform = state.transform;
  }
  state?.entries?.forEach((entry) => {
    entry.target.style.opacity = entry.opacity;
    entry.target.style.transform = entry.transform;
  });
}

const CHAT_TOOLS_SELECTOR = ".chat-tools";
const NAME_FIELD_SELECTOR = ".chat-name-field";
const COLLAPSE_ANCHOR_SELECTOR = ".chat-collapse-hover-zone .chat-collapse-icon-anchor";
const CHAT_LAYOUT_TRANSITION_CLASSES = [
  "chat-layout-transitioning",
  "chat-dock-handle-switching",
  "chat-dock-switching",
  "chat-dock-switching-entered",
  "chat-dock-mobile-transition-out",
  "chat-dock-mobile-transition-out-active",
  "chat-dock-mobile-transition-in",
  "chat-dock-mobile-transition-in-active",
  "chat-bottom-mobile-expand-visual",
  "chat-bottom-mobile-curtain-active",
];
const CHAT_DOCK_SWITCH_CLASSES = [
  "chat-dock-switching",
  "chat-dock-mobile-transition-out",
  "chat-dock-mobile-transition-out-active",
  "chat-dock-mobile-transition-in",
  "chat-dock-mobile-transition-in-active",
];

let scheduledFrame = 0;
const nameAreaReservations = new WeakMap();
const collapseAnchorReservations = new WeakMap();
const resizeObserver = new ResizeObserver(scheduleLayout);
const layoutObserver = new MutationObserver(handleLayoutMutations);
const domObserver = new MutationObserver(handleDomMutations);
const nameMeasureCanvas = document.createElement("canvas");
const nameMeasureContext = nameMeasureCanvas.getContext("2d");

function rectOf(element) {
  return element?.getBoundingClientRect?.() ?? null;
}

function isDisplayed(element) {
  if (!element?.isConnected) return false;

  for (let current = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity) <= 0.02) return false;
  }

  const rect = rectOf(element);
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function hasLayoutBox(element) {
  if (!element?.isConnected || getComputedStyle(element).display === "none") return false;
  const rect = rectOf(element);
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function setLayoutValue(element, property, value) {
  const normalized = `${Math.round(value * 100) / 100}px`;
  if (element.style.getPropertyValue(property) !== normalized) {
    element.style.setProperty(property, normalized);
  }
}

function clearLayoutValues(field) {
  field.style.removeProperty("--chat-name-available-left");
  field.style.removeProperty("--chat-name-available-width");
}

function getNameAreaReservations(owner) {
  let reservations = nameAreaReservations.get(owner);
  if (!reservations) {
    reservations = new Map();
    nameAreaReservations.set(owner, reservations);
  }
  return reservations;
}

function getNameAreaContextKey(sessionView) {
  const dock = sessionView?.dataset.chatDock || "default";
  const layout = [
    sessionView?.classList.contains("layout-stacked") ? "stacked" : "side",
    sessionView?.classList.contains("layout-component-stack") ? "component-stack" : "component-side",
  ].join(":");
  return `${dock}:${layout}:${Math.round(window.innerWidth)}:${Math.round(window.innerHeight)}`;
}

function syncDisplayNameWidth(field) {
  const display = field?.querySelector("#nameDisplay");
  const row = display?.closest(".chat-name-display-row");
  const editButton = row?.querySelector(".chat-name-edit-button");
  if (!display || !row || !editButton) return;

  const rowRect = rectOf(row);
  if (!rowRect || rowRect.width <= 0) return;

  const rowStyle = getComputedStyle(row);
  const horizontalPadding = Number.parseFloat(rowStyle.paddingInlineStart || "0")
    + Number.parseFloat(rowStyle.paddingInlineEnd || "0");
  const rowGap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap || "0") || 0;
  const buttonWidth = editButton.getBoundingClientRect().width || 20;
  const isRightDock = row.closest(".session-view")?.dataset.chatDock === "right";
  // En el dock lateral se centra el conjunto; en el inferior el grid deja
  // espacio simétrico alrededor del nombre y mantiene la reserva en ambos lados.
  const reservedControlSides = isRightDock ? 1 : 2;
  const maxWidth = Math.max(
    0,
    Math.floor(rowRect.width - horizontalPadding - reservedControlSides * (buttonWidth + rowGap)),
  );
  const normalized = `${maxWidth}px`;
  if (display.style.maxWidth !== normalized) display.style.maxWidth = normalized;
}

function syncEditingNameInputWidth(field) {
  const editor = field?.querySelector(".chat-name-editor");
  const input = field?.querySelector("#nameInput");
  const display = field?.querySelector("#nameDisplay");
  const row = input?.closest(".chat-name-edit-row");
  const confirmButton = row?.querySelector(".chat-name-confirm-button");
  if (
    editor?.dataset.editing !== "true"
    || !input
    || !display
    || !row
    || !confirmButton
    || !nameMeasureContext
  ) return;

  const rowRect = rectOf(row);
  if (!rowRect || rowRect.width <= 0) return;

  const rowStyle = getComputedStyle(row);
  const horizontalPadding = Number.parseFloat(rowStyle.paddingInlineStart || "0")
    + Number.parseFloat(rowStyle.paddingInlineEnd || "0");
  const rowGap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap || "0") || 0;
  const buttonWidth = confirmButton.getBoundingClientRect().width || 20;
  const maxWidth = Math.max(
    0,
    Math.floor(rowRect.width - horizontalPadding - 2 * (buttonWidth + rowGap)),
  );

  const displayStyle = getComputedStyle(display);
  nameMeasureContext.font = displayStyle.font;
  nameMeasureContext.fontKerning = "normal";
  // Mientras se edita, el nombre guardado no debe volver a ensanchar un input
  // que el usuario acaba de vaciar; el espacio mínimo lo cubre el fallback.
  const text = input.value || " ";
  const textWidth = Math.max(24, nameMeasureContext.measureText(text).width);
  const targetWidth = Math.min(textWidth, maxWidth);

  input.style.width = `${targetWidth.toFixed(2)}px`;
  input.style.maxWidth = `${maxWidth}px`;
  input.scrollLeft = textWidth > maxWidth ? input.scrollWidth : 0;
}

function createAnchorReservation(headerRect, anchorRect) {
  const headerCenter = headerRect.left + headerRect.width / 2;
  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  const centerOffset = anchorCenter - headerCenter;
  const edgeThreshold = anchorRect.width / 2;

  if (centerOffset < -edgeThreshold) {
    return {
      alignment: "left",
      offset: anchorRect.left - headerRect.left,
      width: anchorRect.width,
      height: anchorRect.height,
      verticalCenterOffset: anchorRect.top + anchorRect.height / 2
        - (headerRect.top + headerRect.height / 2),
    };
  }

  if (centerOffset > edgeThreshold) {
    return {
      alignment: "right",
      offset: headerRect.right - anchorRect.right,
      width: anchorRect.width,
      height: anchorRect.height,
      verticalCenterOffset: anchorRect.top + anchorRect.height / 2
        - (headerRect.top + headerRect.height / 2),
    };
  }

  return {
    alignment: "center",
    offset: centerOffset,
    width: anchorRect.width,
    height: anchorRect.height,
    verticalCenterOffset: anchorRect.top + anchorRect.height / 2
      - (headerRect.top + headerRect.height / 2),
  };
}

function projectAnchorReservation(reservation, headerRect) {
  let left;
  if (reservation.alignment === "left") {
    left = headerRect.left + reservation.offset;
  } else if (reservation.alignment === "right") {
    left = headerRect.right - reservation.offset - reservation.width;
  } else {
    left = headerRect.left + headerRect.width / 2 + reservation.offset - reservation.width / 2;
  }

  const top = headerRect.top + headerRect.height / 2 + reservation.verticalCenterOffset
    - reservation.height / 2;
  return {
    left,
    right: left + reservation.width,
    top,
    bottom: top + reservation.height,
    width: reservation.width,
    height: reservation.height,
  };
}

function isLayoutAnimating(sessionView) {
  return CHAT_LAYOUT_TRANSITION_CLASSES.some((className) => sessionView.classList.contains(className))
    || [...sessionView.querySelectorAll(".chat-collapse-hover-zone.is-transitioning")]
      .some((zone) => getComputedStyle(zone).display !== "none");
}

function isDockSwitching(sessionView) {
  return CHAT_DOCK_SWITCH_CLASSES.some((className) => sessionView?.classList.contains(className));
}

function isHandleLayoutTransitioning(sessionView) {
  return isLayoutAnimating(sessionView)
    || sessionView.classList.contains("chat-header-collapsed");
}

function hasHeaderCollapseHandle(sessionView) {
  if (sessionView.classList.contains("chat-collapsed")) return false;
  return sessionView.dataset.chatDock === "bottom"
    || sessionView.classList.contains("chat-collapse-in-header");
}

function getCollapseAnchorRect(sessionView, headerRect) {
  if (!sessionView) return null;

  const reservation = collapseAnchorReservations.get(sessionView);
  const isTransitioning = isHandleLayoutTransitioning(sessionView);
  if (isTransitioning && reservation) {
    return projectAnchorReservation(reservation, headerRect);
  }

  const headerCollapseZone = hasHeaderCollapseHandle(sessionView)
    ? sessionView.querySelector('.chat-collapse-hover-zone[data-chat-control="collapse"]')
    : null;
  const headerAnchor = headerCollapseZone?.querySelector(".chat-collapse-icon-anchor");
  const headerAnchorRect = rectOf(headerAnchor);
  const headerZoneStyle = headerCollapseZone ? getComputedStyle(headerCollapseZone) : null;
  if (
    headerAnchorRect?.width > 0
    && headerAnchorRect.height > 0
    && headerZoneStyle?.display !== "none"
  ) {
    const nextReservation = createAnchorReservation(headerRect, headerAnchorRect);
    collapseAnchorReservations.set(sessionView, nextReservation);
    return headerAnchorRect;
  }

  const activeControl = sessionView.classList.contains("chat-collapsed") ? "expand" : "collapse";
  const activeAnchor = sessionView.querySelector(
    `.chat-collapse-hover-zone[data-chat-control="${activeControl}"] .chat-collapse-icon-anchor`,
  );
  const anchorRect = rectOf(activeAnchor);
  if (hasLayoutBox(activeAnchor)) {
    collapseAnchorReservations.set(sessionView, createAnchorReservation(headerRect, anchorRect));
    return anchorRect;
  }

  if (reservation) {
    return projectAnchorReservation(reservation, headerRect);
  }
  return null;
}

function actionControlsRect(actions) {
  if (!isDisplayed(actions)) return null;

  const visibleControls = [...actions.children]
    .filter(isDisplayed)
    .map(rectOf)
    .filter(Boolean);
  if (!visibleControls.length) return rectOf(actions);

  return {
    left: Math.min(...visibleControls.map((rect) => rect.left)),
    right: Math.max(...visibleControls.map((rect) => rect.right)),
    top: Math.min(...visibleControls.map((rect) => rect.top)),
    bottom: Math.max(...visibleControls.map((rect) => rect.bottom)),
  };
}

function layoutNameField(tools) {
  const field = tools.querySelector(NAME_FIELD_SELECTOR);
  const headerRect = rectOf(tools);
  if (!field) return;

  const sessionView = tools.closest(".session-view");
  const reservationOwner = sessionView || tools;
  const reservations = getNameAreaReservations(reservationOwner);
  const reservationKey = getNameAreaContextKey(sessionView);
  const previousNameArea = reservations.get(reservationKey);
  const isAnimating = sessionView && isLayoutAnimating(sessionView);
  const isSwitchingDock = isDockSwitching(sessionView);

  if (!headerRect || headerRect.width <= 0 || headerRect.height <= 0) {
    if (previousNameArea) {
      setLayoutValue(field, "--chat-name-available-left", previousNameArea.left);
      setLayoutValue(field, "--chat-name-available-width", previousNameArea.width);
      field.removeAttribute("data-chat-name-layout-pending");
    } else {
      clearLayoutValues(field);
      if (isSwitchingDock) field.setAttribute("data-chat-name-layout-pending", "true");
      else field.removeAttribute("data-chat-name-layout-pending");
    }
    return;
  }

  if (isAnimating && previousNameArea) {
    setLayoutValue(field, "--chat-name-available-left", previousNameArea.left);
    setLayoutValue(field, "--chat-name-available-width", previousNameArea.width);
    return;
  }

  // El tamaño del header puede estabilizarse antes que la posición real de
  // presencia y acciones. Fuera de una animación, vuelve a medir ambos bordes.
  const headerStyle = getComputedStyle(tools);
  const edgeGap = Math.max(0, Number.parseFloat(headerStyle.columnGap) || 0);
  const borderLeft = Number.parseFloat(headerStyle.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(headerStyle.borderRightWidth) || 0;
  const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
  const arrow = getCollapseAnchorRect(sessionView, headerRect);
  const presence = tools.querySelector(".presence-pill");
  const presenceRect = isDisplayed(presence) ? rectOf(presence) : null;
  const actionsRect = actionControlsRect(tools.querySelector(".chat-tools-actions"));
  let availableStart = headerRect.left + borderLeft + paddingLeft;
  let availableEnd = headerRect.right - borderRight - paddingRight;

  if (presenceRect && presenceRect.bottom > headerRect.top && presenceRect.top < headerRect.bottom) {
    availableStart = Math.max(availableStart, presenceRect.right + edgeGap);
  }

  if (actionsRect && actionsRect.bottom > headerRect.top && actionsRect.top < headerRect.bottom) {
    availableEnd = Math.min(availableEnd, actionsRect.left - edgeGap);
  }

  if (
    arrow
    && arrow.bottom > headerRect.top
    && arrow.top < headerRect.bottom
  ) {
    // En el dock lateral la flecha queda a media altura del panel, fuera de
    // esta fila; solo reserva espacio si realmente cruza el header.
    const arrowRect = arrow;
    if (arrowRect.right > availableStart && arrowRect.left < availableEnd) {
      const leftEnd = Math.min(availableEnd, arrowRect.left - edgeGap);
      if (leftEnd > availableStart) {
        // Si la flecha cae dentro del espacio del nombre, se conserva el tramo
        // de su izquierda. Si está pegada al límite izquierdo, el nombre pasa
        // al tramo libre de su derecha para seguir teniendo espacio medible.
        availableEnd = leftEnd;
      } else {
        availableStart = Math.min(availableEnd, Math.max(availableStart, arrowRect.right + edgeGap));
      }
    }
  }

  availableEnd = Math.max(availableStart, availableEnd);
  const containingBlockLeft = headerRect.left + borderLeft;
  const nameArea = {
    left: availableStart - containingBlockLeft,
    width: availableEnd - availableStart,
  };
  setLayoutValue(field, "--chat-name-available-left", nameArea.left);
  setLayoutValue(field, "--chat-name-available-width", nameArea.width);
  // La reserva es por dock y variante de layout: al alternar entre vistas
  // conocidas se reutiliza su geometría y no se recalcula al volver a abrir.
  reservations.set(reservationKey, nameArea);
  if (isAnimating && isSwitchingDock && !previousNameArea) {
    field.setAttribute("data-chat-name-layout-pending", "true");
  } else if (!isAnimating) {
    field.removeAttribute("data-chat-name-layout-pending");
  }
}

function layoutAllNameFields() {
  document.querySelectorAll(CHAT_TOOLS_SELECTOR).forEach((tools) => {
    const field = tools.querySelector(NAME_FIELD_SELECTOR);
    layoutNameField(tools);
    syncDisplayNameWidth(field);
    syncEditingNameInputWidth(field);
  });
}

function scheduleLayout() {
  if (scheduledFrame) return;
  scheduledFrame = requestAnimationFrame(() => {
    scheduledFrame = 0;
    layoutAllNameFields();
  });
}

function isRelevantLayoutElement(element) {
  if (!(element instanceof Element)) return false;
  return element.matches(`${CHAT_TOOLS_SELECTOR}, .session-view, .chat-collapse-hover-zone`)
    || Boolean(element.querySelector(`${CHAT_TOOLS_SELECTOR}, .session-view, .chat-collapse-hover-zone`));
}

function handleDomMutations(records) {
  const relevant = records.some((record) => {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.matches(`${CHAT_TOOLS_SELECTOR}, .session-view`) || target?.closest(CHAT_TOOLS_SELECTOR)) return true;
    return [...record.addedNodes, ...record.removedNodes].some(isRelevantLayoutElement);
  });

  if (!relevant) return;
  refreshObservedElements();
  scheduleLayout();
}

function handleLayoutMutations(records) {
  const relevant = records.some((record) => {
    const target = record.target;
    return !(target instanceof Element && target.matches(NAME_FIELD_SELECTOR) && record.attributeName === "style");
  });
  if (relevant) scheduleLayout();
}

function observeAttributes(element, attributeFilter) {
  if (element) layoutObserver.observe(element, { attributes: true, attributeFilter });
}

function refreshObservedElements() {
  resizeObserver.disconnect();
  layoutObserver.disconnect();

  document.querySelectorAll(CHAT_TOOLS_SELECTOR).forEach((tools) => {
    const field = tools.querySelector(NAME_FIELD_SELECTOR);
    const sessionView = tools.closest(".session-view");
    [tools, field, tools.querySelector(".presence-pill"), tools.querySelector(".chat-tools-actions")]
      .filter(Boolean)
      .forEach((element) => resizeObserver.observe(element));

    observeAttributes(tools, ["class", "style"]);
    observeAttributes(field, ["class", "data-editing"]);
    observeAttributes(tools.querySelector(".presence-pill"), ["class", "style", "hidden"]);
    observeAttributes(tools.querySelector(".chat-tools-actions"), ["class", "style", "hidden"]);

    if (sessionView) {
      resizeObserver.observe(sessionView);
      observeAttributes(sessionView, ["class", "style", "data-chat-dock"]);
      observeAttributes(sessionView.querySelector(".player-frame"), ["class"]);
    }

    sessionView?.querySelectorAll(".chat-collapse-hover-zone, .chat-collapse-icon-anchor").forEach((element) => {
      resizeObserver.observe(element);
      observeAttributes(element, ["class", "style", "hidden", "aria-hidden"]);
    });
  });

  observeAttributes(document.documentElement, ["class"]);
  observeAttributes(document.body, ["class"]);
}

function wireChatNameLayout() {
  refreshObservedElements();
  domObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Element) || !event.target.matches("#nameInput")) return;
    syncEditingNameInputWidth(event.target.closest(NAME_FIELD_SELECTOR));
  });
  document.addEventListener("input", (event) => {
    if (!(event.target instanceof Element) || !event.target.matches("#nameInput")) return;
    syncEditingNameInputWidth(event.target.closest(NAME_FIELD_SELECTOR));
  });
  document.addEventListener("transitionend", scheduleLayout, true);
  document.addEventListener("transitioncancel", scheduleLayout, true);
  window.addEventListener("chat-layout-settled", scheduleLayout);
  window.addEventListener("resize", scheduleLayout, { passive: true });
  window.addEventListener("orientationchange", scheduleLayout, { passive: true });
  document.addEventListener("fullscreenchange", scheduleLayout);
  document.fonts?.ready.then(scheduleLayout);
  scheduleLayout();
}

wireChatNameLayout();

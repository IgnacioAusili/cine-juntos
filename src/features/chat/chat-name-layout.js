const CHAT_TOOLS_SELECTOR = ".chat-tools";
const NAME_FIELD_SELECTOR = ".chat-name-field";
const COLLAPSE_ANCHOR_SELECTOR = ".chat-collapse-hover-zone .chat-collapse-icon-anchor";

let scheduledFrame = 0;
let transitionFrame = 0;
const nameAreaReservations = new WeakMap();
const collapseAnchorReservations = new WeakMap();
const resizeObserver = new ResizeObserver(scheduleLayout);
const layoutObserver = new MutationObserver(handleLayoutMutations);
const domObserver = new MutationObserver(handleDomMutations);

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
  return sessionView.classList.contains("chat-layout-transitioning")
    || sessionView.classList.contains("chat-dock-handle-switching")
    || [...sessionView.querySelectorAll(".chat-collapse-hover-zone.is-transitioning")]
      .some((zone) => getComputedStyle(zone).display !== "none");
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

  const anchor = [...sessionView.querySelectorAll(COLLAPSE_ANCHOR_SELECTOR)].find((candidate) => {
    if (!isDisplayed(candidate)) return false;
    const rect = rectOf(candidate);
    return rect.bottom > headerRect.top && rect.top < headerRect.bottom;
  });
  const anchorRect = rectOf(anchor);
  if (anchorRect) {
    collapseAnchorReservations.set(sessionView, createAnchorReservation(headerRect, anchorRect));
    return anchorRect;
  }

  if (isTransitioning && reservation) {
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
  if (!field || !headerRect || headerRect.width <= 0 || headerRect.height <= 0) {
    if (field) clearLayoutValues(field);
    return;
  }

  const sessionView = tools.closest(".session-view");
  const previousNameArea = sessionView ? nameAreaReservations.get(field) : null;
  const isAnimating = sessionView && isLayoutAnimating(sessionView);
  const isChatCollapsed = sessionView?.classList.contains("chat-collapsed")
    || sessionView?.classList.contains("chat-header-collapsed");
  const arrow = getCollapseAnchorRect(sessionView, headerRect);
  const collapsedHeaderContextMatches = previousNameArea
    && previousNameArea.dock === sessionView?.dataset.chatDock
    && Math.abs(headerRect.width - previousNameArea.headerWidth) <= 3
    && Math.abs(window.innerWidth - previousNameArea.viewportWidth) <= 3
    && Math.abs(window.innerHeight - previousNameArea.viewportHeight) <= 3;
  const keepCollapsedHeaderArea = isChatCollapsed
    && previousNameArea?.hasHeaderArrow
    && collapsedHeaderContextMatches;
  if (previousNameArea && (isAnimating || keepCollapsedHeaderArea)) {
    const reservedNameArea = previousNameArea;
    setLayoutValue(field, "--chat-name-available-left", reservedNameArea.left);
    setLayoutValue(field, "--chat-name-available-width", reservedNameArea.width);
    return;
  }

  const headerStyle = getComputedStyle(tools);
  const edgeGap = Math.max(0, Number.parseFloat(headerStyle.columnGap) || 0);
  const borderLeft = Number.parseFloat(headerStyle.borderLeftWidth) || 0;
  let availableStart = headerRect.left + borderLeft + (Number.parseFloat(headerStyle.paddingLeft) || 0);
  let availableEnd = headerRect.right - (Number.parseFloat(headerStyle.borderRightWidth) || 0)
    - (Number.parseFloat(headerStyle.paddingRight) || 0);

  const presence = tools.querySelector(".presence-pill");
  if (isDisplayed(presence)) {
    const rect = rectOf(presence);
    if (rect.bottom > headerRect.top && rect.top < headerRect.bottom) {
      availableStart = Math.max(availableStart, rect.right + edgeGap);
    }
  }

  const actions = tools.querySelector(".chat-tools-actions");
  const actionsRect = actionControlsRect(actions);
  if (actionsRect) {
    const rect = actionsRect;
    if (rect.bottom > headerRect.top && rect.top < headerRect.bottom) {
      availableEnd = Math.min(availableEnd, rect.left - edgeGap);
    }
  }

  if (arrow) {
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
    headerWidth: headerRect.width,
    hasHeaderArrow: Boolean(arrow),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dock: sessionView?.dataset.chatDock,
  };
  setLayoutValue(field, "--chat-name-available-left", nameArea.left);
  setLayoutValue(field, "--chat-name-available-width", nameArea.width);
  if (sessionView && !isAnimating) {
    nameAreaReservations.set(field, nameArea);
  }
}

function layoutAllNameFields() {
  document.querySelectorAll(CHAT_TOOLS_SELECTOR).forEach(layoutNameField);
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

function trackHandleTransition(event) {
  if (!(event.target instanceof Element) || !event.target.closest(".chat-collapse-hover-zone")) return;
  if (transitionFrame) return;

  const tick = () => {
    layoutAllNameFields();
    const movingHandles = [...document.querySelectorAll(".chat-collapse-hover-zone")]
      .some((handle) => handle.getAnimations({ subtree: true }).some((animation) => animation.playState === "running"));
    transitionFrame = movingHandles ? requestAnimationFrame(tick) : 0;
  };
  transitionFrame = requestAnimationFrame(tick);
}

function wireChatNameLayout() {
  refreshObservedElements();
  domObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("transitionrun", trackHandleTransition, true);
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

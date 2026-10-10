export const systemMessageRowAnchorAnimations = new WeakMap();
const systemMessageRowAnchors = new WeakMap();

export function animateReducedMotionRowAnchor(target, previousSnapshot) {
  const row = target?.closest(".system-message-row");
  const previousRect = previousSnapshot.rowRect || previousSnapshot.bubbleRect;
  const currentRect = row?.getBoundingClientRect();
  if (!row || !previousRect || !currentRect) return;

  const anchor = getSystemMessageRowAnchorState(row);
  const previousCenter = previousRect.top + previousRect.height / 2;
  const currentCenter = currentRect.top + currentRect.height / 2;
  const offset = getNumericComputedStyle(row, "top")
    + previousCenter
    - currentCenter
    - anchor.baseTop;
  setSystemMessageRowAnchorOffset(row, anchor, offset);
}

export function captureSystemMessageRowAnchor(row, previousRect, reservedRect, naturalRect) {
  if (!row || !previousRect || !reservedRect) return null;
  const state = getSystemMessageRowAnchorState(row);
  const previousCenter = previousRect.top + previousRect.height / 2;
  const currentCenter = reservedRect.top + reservedRect.height / 2;
  const currentTop = getNumericComputedStyle(row, "top");
  const rowHeightChange = Math.max(
    0,
    reservedRect.height - (naturalRect?.height || reservedRect.height),
  );
  const startOffset = currentTop + previousCenter - currentCenter - state.baseTop;
  const finalOffset = startOffset + rowHeightChange / 2;
  setSystemMessageRowAnchorOffset(row, state, startOffset);
  return { state, startOffset, finalOffset };
}

export function resetSystemMessageRowAnchor(target) {
  const row = target?.matches?.(".system-message-row")
    ? target
    : target?.querySelector?.(".system-message-row");
  if (!row) return;

  const animation = systemMessageRowAnchorAnimations.get(row);
  animation?.cancel();
  if (systemMessageRowAnchorAnimations.get(row) === animation) {
    systemMessageRowAnchorAnimations.delete(row);
  }
  const state = systemMessageRowAnchors.get(row);
  if (!state) return;
  restoreInlineProperty(row, "top", state.originalTop);
  restoreInlineProperty(row, "margin-bottom", state.originalMarginBottom);
  systemMessageRowAnchors.delete(row);
}

export function setSystemMessageRowAnchorOffset(row, state, offset) {
  row.style.setProperty("top", `${state.baseTop + offset}px`);
  row.style.setProperty("margin-bottom", `${state.baseMarginBottom + offset}px`);
}

function getSystemMessageRowAnchorState(row) {
  let state = systemMessageRowAnchors.get(row);
  if (state) return state;

  const computed = getComputedStyle(row);
  state = {
    originalTop: captureInlineProperty(row, "top"),
    originalMarginBottom: captureInlineProperty(row, "margin-bottom"),
    baseTop: Number.parseFloat(computed.top) || 0,
    baseMarginBottom: Number.parseFloat(computed.marginBottom) || 0,
  };
  systemMessageRowAnchors.set(row, state);
  return state;
}

function getNumericComputedStyle(element, property) {
  return Number.parseFloat(getComputedStyle(element).getPropertyValue(property)) || 0;
}

function captureInlineProperty(element, property) {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreInlineProperty(element, property, original) {
  if (original.value) element.style.setProperty(property, original.value, original.priority);
  else element.style.removeProperty(property);
}

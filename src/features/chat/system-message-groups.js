import { animateCollapsedSystemMessageAdvance, resetSystemMessageRowAnchor, settleSystemMessageRoll } from "./system-message-roll.js?v=20261010-file-size-refactor-02";
import { SYSTEM_GROUP_MIN_SIZE, groupTransitions } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";
import { captureSystemTextSnapshot, clearShortGroup, ensureGroupHeader, findGroupToggle, getContiguousSystemItems, getGroupState, getLatestSystemStreak, applyGroupState, removeGroupHeader } from "./system-message-group-model.js?v=20261010-file-size-refactor-02";
import { getGroupTransitionTarget } from "./system-message-group-visuals.js?v=20261010-file-size-refactor-02";
import { moveGroupToggle } from "./system-message-group-toggle.js?v=20261010-file-size-refactor-02";
import { animateExpandedSystemMessageRemoval, animateExpandedSystemMessageEntry } from "./system-message-group-effects.js?v=20261010-file-size-refactor-02";
export { animateExpandedSystemMessageRemoval } from "./system-message-group-effects.js?v=20261010-file-size-refactor-02";

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
  // Durante la ruleta el centro del renglón queda fijo; no hagas que el
  // selector persiga el cambio de altura del texto.
  applyGroupState(header, state?.expanded ?? false, {
    animateSelector: !previousSnapshot,
  });

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

export function refreshSystemMessageGroup(header) {
  if (!header?.isConnected) return;
  const state = getGroupState(header);
  applyGroupState(header, state?.expanded ?? header.getAttribute("aria-expanded") === "true");
}

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

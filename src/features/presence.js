import { dom } from "../core/dom.js?v=20261011-bem-itcss-oocss-04";
import { renderDisplayName, renderPresence } from "./presence-members.js?v=20261011-bem-itcss-oocss-04";
export { renderMembers, rememberParticipant, renderPresence } from "./presence-members.js?v=20261011-bem-itcss-oocss-04";
import { upsertParticipantRecord } from "./presence-activity.js?v=20261011-bem-itcss-oocss-04";
export { markParticipantActive } from "./presence-activity.js?v=20261011-bem-itcss-oocss-04";
import { syncNameInputWidth } from "./presence-name-layout.js?v=20261011-bem-itcss-oocss-04";
export { syncNameInputWidth } from "./presence-name-layout.js?v=20261011-bem-itcss-oocss-04";
import {
  state,
  getDisplayName,
  logEvent,
} from "../core/state.js?v=20261011-bem-itcss-oocss-04";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  NAME_CHANGE_LIMIT,
  normalizeDisplayName,
} from "../core/name-policy.js?v=20261011-chat-controls-repair-01";
import { makeGuestName } from "../core/utils.js?v=20261011-chat-controls-repair-01";
import {
  hideTooltip,
  setControlIcon,
} from "./icons-tooltips.js?v=20261011-bem-itcss-oocss-04";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js?v=20261011-chat-controls-repair-01";

// El heartbeat llega cada 10 s. La ventana anterior de 12 s dejaba solo
// 2 s para tolerar latencia o una actualización demorada de Firebase, lo
// que hacía parpadear el indicador aunque el participante siguiera activo.
// Debe ser menor que STALE_MEMBER_TIMEOUT_MS para que los desconectados sigan
// limpiándose por el timeout del transporte.
const CONFIRM_NAME_HOLD_MOVE_TOLERANCE_PX = 10;

let nameInputResizeObserver = null;
let confirmNameLongPressTimer = null;
let confirmNameLongPressPointerId = null;
let confirmNameLongPressStart = null;
let suppressNextConfirmNameClick = false;
let suppressNextConfirmNameClickResetTimer = null;
let nameCommitRevealTimer = null;
function getPendingDisplayName() {
  return normalizeDisplayName(dom.nameInput?.value);
}

function syncConfirmNameButtonState() {
  if (!dom.confirmNameButton) return;

  const isEditing = dom.chatNameField?.dataset.editing === "true";
  const nextName = getPendingDisplayName();
  const currentName = getDisplayName();
  const isNoOpConfirm = nextName === currentName;
  const isTooShort = nextName.length < DISPLAY_NAME_MIN_LENGTH;
  const isInvalid = isEditing && isTooShort;
  dom.confirmNameButton.disabled = false;
  dom.confirmNameButton.classList.toggle('chat-name-confirm-button--invalid', isInvalid);
  dom.confirmNameButton.classList.toggle('chat-name-confirm-button--valid', !isInvalid);
  setControlIcon(dom.confirmNameButton, isInvalid ? "x" : "check");

  if (!isEditing) {
    dom.confirmNameButton.dataset.tooltip = "Aceptar nombre (Enter)";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre");
  } else if (isNoOpConfirm) {
    dom.confirmNameButton.dataset.tooltip = "No hay cambios para guardar";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre. No hay cambios para guardar");
  } else if (isTooShort) {
    dom.confirmNameButton.dataset.tooltip = `Si confirmas, volverá al usuario anterior porque el nombre debe tener al menos ${DISPLAY_NAME_MIN_LENGTH} caracteres`;
    dom.confirmNameButton.setAttribute(
      "aria-label",
      `Aceptar nombre. Si confirmas, volverá al usuario anterior porque el nombre debe tener al menos ${DISPLAY_NAME_MIN_LENGTH} caracteres`,
    );
  } else {
    dom.confirmNameButton.dataset.tooltip = "Aceptar nombre (Enter)";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre");
  }
  dom.confirmNameButton.removeAttribute("title");
}

function clearConfirmNameLongPress() {
  if (confirmNameLongPressTimer !== null) {
    window.clearTimeout(confirmNameLongPressTimer);
  }
  confirmNameLongPressTimer = null;
  confirmNameLongPressPointerId = null;
  confirmNameLongPressStart = null;
}

function markConfirmNameLongPress() {
  suppressNextConfirmNameClick = true;
  if (suppressNextConfirmNameClickResetTimer !== null) {
    window.clearTimeout(suppressNextConfirmNameClickResetTimer);
  }
  suppressNextConfirmNameClickResetTimer = window.setTimeout(() => {
    suppressNextConfirmNameClick = false;
    suppressNextConfirmNameClickResetTimer = null;
  }, 1500);
}

function consumeSuppressedConfirmNameClick() {
  const shouldSuppress = suppressNextConfirmNameClick;
  suppressNextConfirmNameClick = false;
  if (suppressNextConfirmNameClickResetTimer !== null) {
    window.clearTimeout(suppressNextConfirmNameClickResetTimer);
  }
  suppressNextConfirmNameClickResetTimer = null;
  return shouldSuppress;
}

function startConfirmNameLongPress(event) {
  if (
    !isTouchPointer(event)
    || (event.button && event.button !== 0)
    || !dom.confirmNameButton?.classList.contains('chat-name-confirm-button--invalid')
  ) return;

  clearConfirmNameLongPress();
  confirmNameLongPressPointerId = event.pointerId;
  confirmNameLongPressStart = { x: event.clientX, y: event.clientY };
  confirmNameLongPressTimer = window.setTimeout(() => {
    if (confirmNameLongPressPointerId !== event.pointerId) return;
    markConfirmNameLongPress();
  }, TOUCH_LONG_PRESS_DELAY_MS);
}

function trackConfirmNameLongPressMove(event) {
  if (
    !isTouchPointer(event)
    || confirmNameLongPressPointerId !== event.pointerId
    || !confirmNameLongPressStart
  ) return;

  const movedX = event.clientX - confirmNameLongPressStart.x;
  const movedY = event.clientY - confirmNameLongPressStart.y;
  if (Math.hypot(movedX, movedY) <= CONFIRM_NAME_HOLD_MOVE_TOLERANCE_PX) return;

  const longPressAlreadyTriggered = suppressNextConfirmNameClick;
  clearConfirmNameLongPress();
  if (!longPressAlreadyTriggered) consumeSuppressedConfirmNameClick();
}

function finishConfirmNameLongPress() {
  clearConfirmNameLongPress();
}

function cancelConfirmNameLongPress() {
  clearConfirmNameLongPress();
  consumeSuppressedConfirmNameClick();
}

function syncEditNameButtonState() {
  if (!dom.editNameButton) return;
  const limitReached = state.chat.nameChangeCount >= NAME_CHANGE_LIMIT;
  dom.editNameButton.disabled = limitReached;
  if (limitReached) {
    dom.editNameButton.dataset.tooltip = `Alcanzaste el límite de ${NAME_CHANGE_LIMIT} cambios de nombre en esta sesión`;
    dom.editNameButton.setAttribute("aria-label", `Editar nombre deshabilitado. Alcanzaste el límite de ${NAME_CHANGE_LIMIT} cambios de nombre en esta sesión`);
    dom.editNameButton.removeAttribute("title");
  } else {
    dom.editNameButton.dataset.tooltip = "Editar nombre";
    dom.editNameButton.setAttribute("aria-label", "Editar nombre");
    dom.editNameButton.removeAttribute("title");
  }
}

export function updateDisplayName(value, sourceInput, { allowLobbyEdit = false } = {}) {
  const nextName = normalizeDisplayName(value).slice(0, DISPLAY_NAME_MAX_LENGTH);
  const lockedName = normalizeDisplayName(localStorage.getItem("cine-juntos-name"))
    || makeGuestName(state.session.clientId);

  if (state.chat.nameChangeCount >= NAME_CHANGE_LIMIT && !allowLobbyEdit) {
    if (dom.nameInput) dom.nameInput.value = lockedName;
    if (dom.lobbyNameInput) dom.lobbyNameInput.value = lockedName;
    state.session.knownMembers.set(state.session.clientId, lockedName);
    upsertParticipantRecord(state.session.clientId, { name: lockedName });
    renderDisplayName(lockedName);
    renderPresence();
    return;
  }

  if (sourceInput !== dom.nameInput) dom.nameInput.value = nextName;
  if (sourceInput !== dom.lobbyNameInput) dom.lobbyNameInput.value = nextName;
  if (sourceInput === dom.nameInput) syncNameInputWidth();
  localStorage.setItem("cine-juntos-name", nextName.trim() || makeGuestName(state.session.clientId));
  state.session.knownMembers.set(state.session.clientId, getDisplayName());
  upsertParticipantRecord(state.session.clientId, { name: getDisplayName() });
  renderDisplayName();
  renderPresence();
}

function clearNameCommitReveal(editor = dom.chatNameField) {
  if (nameCommitRevealTimer !== null) {
    window.clearTimeout(nameCommitRevealTimer);
    nameCommitRevealTimer = null;
  }
  editor?.classList.remove('chat-name-editor--commit-stable', 'chat-name-editor--commit-reveal');
}

function setIdentityEditing(
  isEditing,
  { preserveCommittedName = false, animateReveal = false } = {},
) {
  const editor = dom.chatNameField;
  if (!editor) return;
  if (isEditing && state.chat.nameChangeCount >= NAME_CHANGE_LIMIT) return;

  if (
    isEditing
    && (editor.classList.contains('chat-name-editor--commit-stable')
      || editor.classList.contains('chat-name-editor--commit-reveal'))
  ) {
    clearNameCommitReveal(editor);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setIdentityEditing(true));
    });
    return;
  }

  editor.classList.toggle('chat-name-editor--commit-stable', !isEditing && preserveCommittedName);
  editor.classList.toggle('chat-name-editor--commit-reveal', !isEditing && preserveCommittedName && animateReveal);
  editor.dataset.editing = isEditing ? "true" : "false";
  editor.parentElement?.setAttribute("data-editing", isEditing ? "true" : "false");

  if (!isEditing) {
    if (preserveCommittedName) {
      if (animateReveal) {
        nameCommitRevealTimer = window.setTimeout(() => {
          nameCommitRevealTimer = null;
          if (editor.dataset.editing !== "true") clearNameCommitReveal(editor);
        }, 780);
      } else {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => editor.classList.remove('chat-name-editor--commit-stable'));
        });
      }
    }
    dom.nameInput.value = getDisplayName();
    syncNameInputWidth();
    syncConfirmNameButtonState();
    return;
  }

  dom.nameInput.value = getDisplayName();
  dom.nameInput.setCustomValidity("");
  syncConfirmNameButtonState();
  syncNameInputWidth();
  window.requestAnimationFrame(() => {
    syncNameInputWidth();
    dom.nameInput.focus();
    dom.nameInput.select();
  });
}

export function cancelIdentityEditing() {
  if (dom.chatNameField?.dataset.editing !== "true") return;
  delete dom.nameInput.dataset.commitOnBlur;
  setIdentityEditing(false, { preserveCommittedName: true });
  dom.nameInput.blur();
}

function commitDisplayNameChange() {
  delete dom.nameInput.dataset.commitOnBlur;
  if (state.chat.nameChangeCount >= NAME_CHANGE_LIMIT) {
    setIdentityEditing(false);
    return;
  }

  const previousName = getDisplayName();
  const requestedName = getPendingDisplayName();
  if (requestedName === previousName) {
    setIdentityEditing(false, { preserveCommittedName: true });
    return;
  }
  if (requestedName.length < DISPLAY_NAME_MIN_LENGTH) {
    dom.nameInput.setCustomValidity("");
    if (dom.nameInput) dom.nameInput.value = previousName;
    if (dom.lobbyNameInput) dom.lobbyNameInput.value = previousName;
    syncNameInputWidth();
    renderDisplayName(previousName);
    renderPresence();
    syncConfirmNameButtonState();
    setIdentityEditing(false);
    return;
  }

  dom.nameInput.setCustomValidity("");
  updateDisplayName(requestedName, dom.nameInput);
  const confirmedName = getDisplayName();
  dom.nameInput.value = confirmedName;
  syncNameInputWidth();
  if (dom.lobbyNameInput) dom.lobbyNameInput.value = confirmedName;
  const nameChanged = confirmedName !== previousName;
  if (nameChanged) {
    state.session.transport?.updateMember?.(confirmedName);
    state.chat.nameChangeCount += 1;
    logEvent("user", `Nombre actualizado: ${confirmedName}`);
  }
  syncEditNameButtonState();
  syncConfirmNameButtonState();
  setIdentityEditing(false, { preserveCommittedName: true, animateReveal: nameChanged });
}

export function wireIdentityEvents() {
  renderDisplayName();
  dom.nameInput.value = getDisplayName();
  syncNameInputWidth();
  syncEditNameButtonState();

  dom.editNameButton?.addEventListener("click", () => {
    if (state.chat.nameChangeCount >= NAME_CHANGE_LIMIT) return;
    setIdentityEditing(true);
  });

  dom.confirmNameButton?.addEventListener("click", (event) => {
    if (consumeSuppressedConfirmNameClick()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    commitDisplayNameChange();
  });

  dom.confirmNameButton?.addEventListener("pointerdown", startConfirmNameLongPress);
  document.addEventListener("pointermove", trackConfirmNameLongPressMove, { passive: true });
  document.addEventListener("pointerup", finishConfirmNameLongPress, { passive: true });
  document.addEventListener("pointercancel", cancelConfirmNameLongPress, { passive: true });

  dom.confirmNameButton?.addEventListener("pointerdown", () => {
    dom.nameInput.dataset.commitOnBlur = "1";
  });

  dom.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDisplayNameChange();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelIdentityEditing();
    }
  });

  dom.nameInput.addEventListener("blur", () => {
    if (dom.nameInput.dataset.commitOnBlur === "1") {
      delete dom.nameInput.dataset.commitOnBlur;
      return;
    }
    cancelIdentityEditing();
  });

  document.addEventListener("pointerdown", (event) => {
    if (dom.chatNameField?.dataset.editing !== "true") return;
    if (!(event.target instanceof Node)) return;
    if (dom.chatNameField.contains(event.target)) return;
    cancelIdentityEditing();
  });

  dom.nameInput.addEventListener("input", () => {
    hideTooltip();
    dom.nameInput.setCustomValidity("");
    syncConfirmNameButtonState();
    syncNameInputWidth();
  });

  window.addEventListener("resize", () => {
    syncNameInputWidth();
  });

  const chatTools = dom.chatNameField.closest(".chat-tools");
  if (typeof ResizeObserver === "function" && chatTools) {
    nameInputResizeObserver?.disconnect();
    nameInputResizeObserver = new ResizeObserver(syncNameInputWidth);
    nameInputResizeObserver.observe(chatTools);
  }
}

import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { renderDisplayName, renderMembers, rememberParticipant, renderPresence, cancelIdentityEditing } from "./presence-members.js?v=20261010-file-size-refactor-02";
export { renderMembers, rememberParticipant, renderPresence } from "./presence-members.js?v=20261010-file-size-refactor-02";
import { upsertParticipantRecord, markParticipantActive } from "./presence-activity.js?v=20261010-file-size-refactor-02";
export { markParticipantActive } from "./presence-activity.js?v=20261010-file-size-refactor-02";
import { syncNameInputWidth } from "./presence-name-layout.js?v=20261010-file-size-refactor-02";
export { syncNameInputWidth } from "./presence-name-layout.js?v=20261010-file-size-refactor-02";
import {
  state,
  getDisplayName,
  logEvent,
} from "../core/state.js?v=20261010-file-size-refactor-02";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  NAME_CHANGE_LIMIT,
  normalizeDisplayName,
} from "../core/name-policy.js?v=20261010-file-size-refactor-02";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js?v=20261010-file-size-refactor-02";
import {
  hideTooltip,
  setControlIcon,
} from "./icons-tooltips.js?v=20261010-file-size-refactor-02";
import {
  isTouchPointer,
  TOUCH_LONG_PRESS_DELAY_MS,
} from "../core/touch-interactions.js?v=20261010-file-size-refactor-02";

// El heartbeat llega cada 10 s. La ventana anterior de 12 s dejaba solo
// 2 s para tolerar latencia o una actualización demorada de Firebase, lo
// que hacía parpadear el indicador aunque el participante siguiera activo.
// Debe ser menor que STALE_MEMBER_TIMEOUT_MS para que los desconectados sigan
// limpiándose por el timeout del transporte.
const CONFIRM_NAME_HOLD_MOVE_TOLERANCE_PX = 10;

let activityRefreshTimer = null;
let nameInputResizeObserver = null;
let confirmNameLongPressTimer = null;
let confirmNameLongPressPointerId = null;
let confirmNameLongPressStart = null;
let suppressNextConfirmNameClick = false;
let suppressNextConfirmNameClickResetTimer = null;
let nameCommitRevealTimer = null;
const recentActivityByParticipantId = new Map();

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
  dom.confirmNameButton.classList.toggle("is-invalid", isInvalid);
  dom.confirmNameButton.classList.toggle("is-valid", !isInvalid);
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
    || !dom.confirmNameButton?.classList.contains("is-invalid")
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

export { cancelIdentityEditing };

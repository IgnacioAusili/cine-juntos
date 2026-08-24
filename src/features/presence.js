import { dom } from "../core/dom.js";
import {
  state,
  NAME_CHANGE_LIMIT,
  getDisplayName,
  getTransportNow,
  logEvent,
} from "../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js";
import { hideTooltip } from "./icons-tooltips.js";

// El heartbeat llega cada 10 s. La ventana anterior de 12 s dejaba solo
// 2 s para tolerar latencia o una actualización demorada de Firebase, lo
// que hacía parpadear el indicador aunque el participante siguiera activo.
// Debe ser menor que STALE_MEMBER_TIMEOUT_MS para que los desconectados sigan
// limpiándose por el timeout del transporte.
const RECENT_ACTIVITY_WINDOW_MS = 30000;

let nameInputMeasureCanvas = null;
let activityRefreshTimer = null;
let nameInputResizeObserver = null;
const recentActivityByParticipantId = new Map();
const MIN_DISPLAY_NAME_LENGTH = 3;

function getPendingDisplayName() {
  return String(dom.nameInput?.value || "").trim().slice(0, 28);
}

function syncConfirmNameButtonState() {
  if (!dom.confirmNameButton) return;

  const isEditing = dom.chatNameField?.dataset.editing === "true";
  const nextName = getPendingDisplayName();
  const currentName = getDisplayName();
  const isNoOpConfirm = nextName === currentName;
  const isTooShort = nextName.length < MIN_DISPLAY_NAME_LENGTH;
  dom.confirmNameButton.disabled = false;

  if (!isEditing) {
    dom.confirmNameButton.dataset.tooltip = "Aceptar nombre (Enter)";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre");
  } else if (isNoOpConfirm) {
    dom.confirmNameButton.dataset.tooltip = "No hay cambios para guardar";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre. No hay cambios para guardar");
  } else if (isTooShort) {
    dom.confirmNameButton.dataset.tooltip = `Si confirmas, volverá al usuario anterior porque el nombre debe tener al menos ${MIN_DISPLAY_NAME_LENGTH} caracteres`;
    dom.confirmNameButton.setAttribute(
      "aria-label",
      `Aceptar nombre. Si confirmas, volverá al usuario anterior porque el nombre debe tener al menos ${MIN_DISPLAY_NAME_LENGTH} caracteres`,
    );
  } else {
    dom.confirmNameButton.dataset.tooltip = "Aceptar nombre (Enter)";
    dom.confirmNameButton.setAttribute("aria-label", "Aceptar nombre");
  }
  dom.confirmNameButton.removeAttribute("title");
}

function syncEditNameButtonState() {
  if (!dom.editNameButton) return;
  const limitReached = state.chat.nameChangeCount >= NAME_CHANGE_LIMIT;
  dom.editNameButton.disabled = limitReached;
  if (limitReached) {
    dom.editNameButton.dataset.tooltip = `Alcanzaste el límite de ${NAME_CHANGE_LIMIT} cambios de nombre en esta sala`;
    dom.editNameButton.setAttribute("aria-label", `Editar nombre deshabilitado. Alcanzaste el límite de ${NAME_CHANGE_LIMIT} cambios de nombre en esta sala`);
    dom.editNameButton.removeAttribute("title");
  } else {
    dom.editNameButton.dataset.tooltip = "Editar nombre";
    dom.editNameButton.setAttribute("aria-label", "Editar nombre");
    dom.editNameButton.removeAttribute("title");
  }
}

function getNameInputMeasureContext() {
  if (!nameInputMeasureCanvas) {
    nameInputMeasureCanvas = document.createElement("canvas");
  }
  return nameInputMeasureCanvas.getContext("2d");
}

function buildCanvasFont(computedStyle) {
  const fontStyle = computedStyle.fontStyle || "normal";
  const fontVariant = computedStyle.fontVariant || "normal";
  const fontWeight = computedStyle.fontWeight || "400";
  const fontSize = computedStyle.fontSize || "16px";
  const lineHeight = computedStyle.lineHeight && computedStyle.lineHeight !== "normal"
    ? `/${computedStyle.lineHeight}`
    : "";
  const fontFamily = computedStyle.fontFamily || "sans-serif";
  return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}${lineHeight} ${fontFamily}`;
}

function getNameInputAvailableWidth() {
  const tools = dom.chatNameField?.closest(".chat-tools");
  if (!tools) return Number.POSITIVE_INFINITY;

  const computed = window.getComputedStyle(tools);
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
  const columnGap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
  const leftColumn = tools.children[0];
  const rightColumn = tools.children[2];
  const leftWidth = leftColumn ? Math.ceil(leftColumn.getBoundingClientRect().width) : 0;
  const rightWidth = rightColumn ? Math.ceil(rightColumn.getBoundingClientRect().width) : 0;
  const contentWidth = Math.max(0, Math.floor(tools.getBoundingClientRect().width - paddingLeft - paddingRight));

  // El editor vive en la columna central del grid; calculamos el ancho real
  // que le queda descontando las columnas laterales y los separadores.
  const availableWidth = contentWidth - leftWidth - rightWidth - (columnGap * 2);
  const editRow = dom.nameInput?.closest(".chat-name-edit-row");
  const rowStyle = editRow ? window.getComputedStyle(editRow) : null;
  const rowGap = Number.parseFloat(rowStyle?.columnGap || rowStyle?.gap || "0") || 0;
  const confirmWidth = dom.confirmNameButton?.getBoundingClientRect().width || 0;
  return Math.max(0, Math.floor(availableWidth - confirmWidth - rowGap));
}

function syncNameInputWidth() {
  if (!dom.nameInput || !dom.chatNameField) return;

  const input = dom.nameInput;
  const display = dom.nameDisplay;
  const computed = window.getComputedStyle(display || input);
  const context = getNameInputMeasureContext();

  if (context) {
    context.font = buildCanvasFont(computed);
    context.fontKerning = "normal";
  }

  const isEditing = dom.chatNameField.dataset.editing === "true";
  const text = input.value || (!isEditing ? getDisplayName() : "") || "";
   const measuredWidth = context ? context.measureText(text || " ").width : 24;
  const textWidth = Math.max(24, measuredWidth);
  const availableWidth = getNameInputAvailableWidth();
  const maxWidth = availableWidth;
  const targetWidth = Math.min(textWidth, maxWidth);

  input.style.width = `${targetWidth}px`;
  input.style.maxWidth = `${maxWidth}px`;

  if (textWidth > maxWidth) {
    input.scrollLeft = input.scrollWidth;
  } else {
    input.scrollLeft = 0;
  }
}

function renderDisplayName(name = getDisplayName()) {
  if (dom.nameDisplay) {
    dom.nameDisplay.textContent = name || makeGuestName(state.session.clientId);
  }
}

function getParticipantRecord(participantId) {
  return state.session.knownMemberRecords?.get(participantId) || null;
}

function upsertParticipantRecord(participantId, nextValues = {}) {
  if (!participantId) return null;

  if (!state.session.knownMemberRecords) {
    state.session.knownMemberRecords = new Map();
  }

  const current = state.session.knownMemberRecords.get(participantId) || {};
  const nextName =
    nextValues.name ||
    current.name ||
    state.session.knownMembers?.get(participantId) ||
    makeParticipantLabel(participantId);
  const nextLastSeenAt = Number.isFinite(Number(nextValues.lastSeenAt))
    ? Number(nextValues.lastSeenAt)
    : Number(current.lastSeenAt) || 0;
  const record = {
    name: nextName,
    lastSeenAt: nextLastSeenAt,
  };

  state.session.knownMemberRecords.set(participantId, record);
  if (state.session.knownMembers?.has(participantId)) {
    state.session.knownMembers.set(participantId, nextName);
  }

  return record;
}

function getParticipantActivityAt(participantId) {
  const record = getParticipantRecord(participantId);
  const recentActivityAt = recentActivityByParticipantId.get(participantId) || 0;
  return Math.max(Number(record?.lastSeenAt) || 0, recentActivityAt);
}

function isParticipantRecentlyActive(participantId) {
  const lastActivityAt = getParticipantActivityAt(participantId);
  return lastActivityAt > 0 && getTransportNow() - lastActivityAt <= RECENT_ACTIVITY_WINDOW_MS;
}

function scheduleActivityRefresh() {
  window.clearTimeout(activityRefreshTimer);

  let nextRefreshIn = Number.POSITIVE_INFINITY;
  const now = getTransportNow();

  for (const participantId of state.session.knownParticipants || []) {
    const lastActivityAt = getParticipantActivityAt(participantId);
    if (!lastActivityAt) continue;
    const remaining = RECENT_ACTIVITY_WINDOW_MS - (now - lastActivityAt);
    if (remaining > 0 && remaining < nextRefreshIn) {
      nextRefreshIn = remaining;
    }
  }

  if (!Number.isFinite(nextRefreshIn)) return;

  activityRefreshTimer = window.setTimeout(() => {
    renderPresence();
  }, Math.max(250, nextRefreshIn + 25));
}

export function markParticipantActive(participantId, participantName = "") {
  if (!participantId) return;

  recentActivityByParticipantId.set(participantId, getTransportNow());
  if (participantName) {
    upsertParticipantRecord(participantId, { name: participantName });
  } else if (state.session.knownMembers?.has(participantId)) {
    upsertParticipantRecord(participantId);
  }

  renderPresence();
}

function setIdentityEditing(isEditing, { animateReveal = false } = {}) {
  if (!dom.chatNameField) return;
  if (isEditing && state.chat.nameChangeCount >= NAME_CHANGE_LIMIT) return;
  dom.chatNameField.classList.remove("name-commit-reveal");
  dom.chatNameField.dataset.editing = isEditing ? "true" : "false";
  dom.chatNameField.parentElement?.setAttribute("data-editing", isEditing ? "true" : "false");

  if (!isEditing && animateReveal) {
    dom.chatNameField.classList.add("name-commit-reveal");
    window.setTimeout(() => {
      dom.chatNameField?.classList.remove("name-commit-reveal");
    }, 260);
  }

  if (!isEditing) {
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

function cancelIdentityEditing() {
  if (dom.chatNameField?.dataset.editing !== "true") return;
  setIdentityEditing(false);
}

function commitDisplayNameChange() {
  if (state.chat.nameChangeCount >= NAME_CHANGE_LIMIT) {
    setIdentityEditing(false);
    return;
  }

  const previousName = getDisplayName();
  const requestedName = getPendingDisplayName();
  if (requestedName === previousName) {
    setIdentityEditing(false);
    return;
  }
  if (requestedName.length < MIN_DISPLAY_NAME_LENGTH) {
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
    sessionStorage.setItem("cine-juntos-name-change-count", String(state.chat.nameChangeCount));
    sessionStorage.removeItem("cine-juntos-name-change-used");
    logEvent("user", `Nombre actualizado: ${confirmedName}`);
  }
  syncEditNameButtonState();
  syncConfirmNameButtonState();
  setIdentityEditing(false, { animateReveal: true });
}

export function renderMembers(members) {
  const nextMembers = new Map([[state.session.clientId, getDisplayName()]]);
  const nextMemberRecords = new Map([[
    state.session.clientId,
    {
      name: getDisplayName(),
      lastSeenAt: getTransportNow(),
    },
  ]]);
  const activeIds = new Set([state.session.clientId]);

  Object.entries(members || {}).forEach(([id, member]) => {
    const memberId = member?.id || id;
    if (!memberId) return;
    const memberName = member?.name || makeParticipantLabel(memberId);
    const previousRecord = state.session.knownMemberRecords?.get(memberId) || {};
    const lastSeenAt = Number.isFinite(Number(member?.lastSeenAt))
      ? Number(member.lastSeenAt)
      : Number(previousRecord.lastSeenAt) || 0;
    nextMembers.set(memberId, memberName);
    nextMemberRecords.set(memberId, {
      name: memberName,
      lastSeenAt,
    });
    activeIds.add(memberId);
  });

  state.session.knownMembers = nextMembers;
  state.session.knownMemberRecords = nextMemberRecords;
  state.session.knownParticipants = activeIds;
  renderPresence();
}

export function rememberParticipant(participantId, participantName) {
  if (!participantId) return;
  // Solo actualiza el nombre si el participante ya está registrado.
  // Los nuevos participantes se agregan via renderMembers → onMembers.
  if (state.session.knownMembers.has(participantId)) {
    state.session.knownMembers.set(
      participantId,
      participantName || state.session.knownMembers.get(participantId) || makeParticipantLabel(participantId),
    );
    upsertParticipantRecord(participantId, { name: participantName });
  }
}

export function renderPresence() {
  if (!dom.participantCount || !dom.presencePill) return;

  renderDisplayName();

  const members = Array.from(state.session.knownMembers.entries())
    .filter(([id]) => {
      if (!state.session.knownParticipants.has(id)) return false;
      return id === state.session.clientId || isParticipantRecentlyActive(id);
    })
    .map(([id, name]) => {
      const displayName = id === state.session.clientId
        ? `(Vos) ${name || makeGuestName(state.session.clientId)}`
        : name || makeParticipantLabel(id);
      return displayName;
    });

  const fallbackSelf = `(Vos) ${getDisplayName()}`;
  const uniqueMembers = members.length ? members : [fallbackSelf];
  const selfMember = uniqueMembers.find((member) => member.startsWith("(Vos) "));
  const otherMembers = uniqueMembers.filter((member) => member !== selfMember);
  const orderedMembers = selfMember ? [selfMember, ...otherMembers] : uniqueMembers;
  const isSoloSelf = orderedMembers.length === 1 && Boolean(selfMember);
  const tooltip = `${isSoloSelf ? "Conectado" : "Conectados"}:\n${orderedMembers.join("\n")}`;
  const label = uniqueMembers.length === 1 ? "1 usuario conectado" : `${uniqueMembers.length} usuarios conectados`;
  const nextState = isSoloSelf ? "solo" : "online";
  const selfLabelText = isSoloSelf ? "(vos)" : "";

  dom.participantCount.textContent = String(uniqueMembers.length);
  dom.presencePill.dataset.state = nextState;
  dom.presencePill.dataset.tooltip = tooltip;
  dom.presencePill.removeAttribute("title");
  dom.presencePill.setAttribute("aria-label", label);
  if (dom.presenceSelfLabel) {
    dom.presenceSelfLabel.textContent = selfLabelText;
    dom.presenceSelfLabel.hidden = !isSoloSelf;
  }

  if (dom.overlayParticipantCount && dom.overlayPresencePill) {
    dom.overlayParticipantCount.textContent = String(uniqueMembers.length);
    dom.overlayPresencePill.dataset.state = nextState;
    dom.overlayPresencePill.dataset.tooltip = tooltip;
    dom.overlayPresencePill.removeAttribute("title");
    dom.overlayPresencePill.setAttribute("aria-label", label);
    if (dom.overlayPresenceSelfLabel) {
      dom.overlayPresenceSelfLabel.textContent = selfLabelText;
      dom.overlayPresenceSelfLabel.hidden = !isSoloSelf;
    }
  }

  scheduleActivityRefresh();
}

export function updateDisplayName(value, sourceInput, { allowLobbyEdit = false } = {}) {
  const nextName = String(value || "").slice(0, 28);
  const lockedName = localStorage.getItem("cine-juntos-name") || makeGuestName(state.session.clientId);

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

  dom.confirmNameButton?.addEventListener("click", () => {
    commitDisplayNameChange();
  });

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

  dom.nameInput.addEventListener("blur", (event) => {
    if (dom.nameInput.dataset.commitOnBlur === "1") {
      delete dom.nameInput.dataset.commitOnBlur;
      return;
    }

    if (event.relatedTarget instanceof HTMLElement && dom.chatNameField?.contains(event.relatedTarget)) {
      return;
    }

    cancelIdentityEditing();
  });

  document.addEventListener("pointerdown", (event) => {
    if (dom.chatNameField?.dataset.editing !== "true") return;
    if (!(event.target instanceof HTMLElement)) return;
    if (dom.chatNameField.contains(event.target)) return;
    dom.nameInput.blur();
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

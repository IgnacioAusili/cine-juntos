import { dom } from "../core/dom.js";
import { state, getDisplayName, getTransportNow, logEvent } from "../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js";

const RECENT_ACTIVITY_WINDOW_MS = 12000;
const SUPPORTS_FIELD_SIZING_CONTENT = Boolean(CSS.supports?.("field-sizing", "content"));

let nameInputMeasureCanvas = null;
let activityRefreshTimer = null;
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
  dom.editNameButton.disabled = Boolean(state.chat.nameChangeUsed);
  if (state.chat.nameChangeUsed) {
    dom.editNameButton.dataset.tooltip = "Ya superaste los cambios permitidos para tu nombre";
    dom.editNameButton.setAttribute("aria-label", "Editar nombre deshabilitado. Ya superaste los cambios permitidos para tu nombre");
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

function applyNativeNameInputSizing() {
  if (!dom.nameInput) return;
  dom.nameInput.style.fieldSizing = "content";
  dom.nameInput.style.removeProperty("width");
  dom.nameInput.style.removeProperty("max-width");
}

function getNameInputAvailableWidth() {
  const tools = dom.chatNameField?.parentElement;
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
  return Math.max(24, Math.floor(availableWidth));
}

function syncNameInputWidth() {
  if (!dom.nameInput || !dom.chatNameField) return;

  if (SUPPORTS_FIELD_SIZING_CONTENT) {
    applyNativeNameInputSizing();
    return;
  }

  const input = dom.nameInput;
  const display = dom.nameDisplay;
  const computed = window.getComputedStyle(display || input);
  const context = getNameInputMeasureContext();

  if (context) {
    context.font = buildCanvasFont(computed);
    context.fontKerning = "normal";
  }

  const text = input.value || getDisplayName() || "";
  const measuredWidth = context ? Math.ceil(context.measureText(text || " ").width) : 24;
  const textWidth = Math.max(24, measuredWidth);
  const availableWidth = getNameInputAvailableWidth();
  const maxWidth = Math.max(24, availableWidth);
  const minWidth = 24;
  const targetWidth = Math.max(minWidth, Math.min(textWidth, maxWidth));

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
  return lastActivityAt > 0 && Date.now() - lastActivityAt <= RECENT_ACTIVITY_WINDOW_MS;
}

function scheduleActivityRefresh() {
  window.clearTimeout(activityRefreshTimer);

  let nextRefreshIn = Number.POSITIVE_INFINITY;
  const now = Date.now();

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

  recentActivityByParticipantId.set(participantId, Date.now());
  if (participantName) {
    upsertParticipantRecord(participantId, { name: participantName });
  } else if (state.session.knownMembers?.has(participantId)) {
    upsertParticipantRecord(participantId);
  }

  renderPresence();
}

function setIdentityEditing(isEditing) {
  if (!dom.chatNameField) return;
  if (isEditing && state.chat.nameChangeUsed) return;
  dom.chatNameField.dataset.editing = isEditing ? "true" : "false";

  if (!isEditing) {
    dom.nameInput.value = getDisplayName();
    syncNameInputWidth();
    syncConfirmNameButtonState();
    return;
  }

  dom.nameInput.value = getDisplayName();
  dom.nameInput.setCustomValidity("");
  syncConfirmNameButtonState();
  applyNativeNameInputSizing();
  window.requestAnimationFrame(() => {
    applyNativeNameInputSizing();
    dom.nameInput.focus();
    dom.nameInput.select();
  });
}

function cancelIdentityEditing() {
  if (dom.chatNameField?.dataset.editing !== "true") return;
  setIdentityEditing(false);
}

function commitDisplayNameChange() {
  if (state.chat.nameChangeUsed) {
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
    state.chat.nameChangeUsed = true;
    sessionStorage.setItem("cine-juntos-name-change-used", "1");
    logEvent("user", `Nombre actualizado: ${confirmedName}`);
  }
  syncEditNameButtonState();
  syncConfirmNameButtonState();
  setIdentityEditing(false);
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
    .filter(([id]) => state.session.knownParticipants.has(id))
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

export function updateDisplayName(value, sourceInput) {
  const nextName = String(value || "").slice(0, 28);
  const lockedName = localStorage.getItem("cine-juntos-name") || makeGuestName(state.session.clientId);

  if (state.chat.nameChangeUsed) {
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
  if (SUPPORTS_FIELD_SIZING_CONTENT) {
    applyNativeNameInputSizing();
  } else {
    syncNameInputWidth();
  }
  syncEditNameButtonState();

  dom.editNameButton?.addEventListener("click", () => {
    if (state.chat.nameChangeUsed) return;
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
    dom.nameInput.setCustomValidity("");
    syncConfirmNameButtonState();
    if (!SUPPORTS_FIELD_SIZING_CONTENT) syncNameInputWidth();
  });

  window.addEventListener("resize", () => {
    if (dom.chatNameField?.dataset.editing === "true" && !SUPPORTS_FIELD_SIZING_CONTENT) {
      syncNameInputWidth();
    }
  });
}

export { cancelIdentityEditing };

import { dom } from "../core/dom.js";
import { state, getDisplayName, logEvent } from "../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js";

let nameInputMeasureCanvas = null;
let nameInputBaseWidth = 0;

function syncEditNameButtonState() {
  if (!dom.editNameButton) return;
  dom.editNameButton.disabled = Boolean(state.chat.nameChangeUsed);
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

  const text = input.value || getDisplayName() || "";
  const measuredWidth = context ? Math.ceil(context.measureText(text || " ").width) : 24;
  const textWidth = Math.max(24, measuredWidth);
  const fieldWidth = Math.floor(dom.chatNameField.getBoundingClientRect().width);
  const buttonWidth = dom.confirmNameButton ? Math.ceil(dom.confirmNameButton.getBoundingClientRect().width) : 0;
  const gapValue = dom.chatNameEditor ? window.getComputedStyle(dom.chatNameEditor).columnGap : "0px";
  const rowGap = Number.parseFloat(gapValue);
  const safeRowGap = Number.isFinite(rowGap) ? rowGap : 0;
  const maxWidth = Math.max(24, fieldWidth - buttonWidth - safeRowGap);
  const minWidth = Math.max(24, nameInputBaseWidth || 0);
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

function setIdentityEditing(isEditing) {
  if (!dom.chatNameField) return;
  if (isEditing && state.chat.nameChangeUsed) return;
  dom.chatNameField.dataset.editing = isEditing ? "true" : "false";

  if (!isEditing) {
    nameInputBaseWidth = 0;
    dom.nameInput.value = getDisplayName();
    return;
  }

  dom.nameInput.value = getDisplayName();
  window.requestAnimationFrame(() => {
    nameInputBaseWidth = Math.ceil(dom.nameDisplay?.getBoundingClientRect().width || dom.nameInput.getBoundingClientRect().width || 24);
    syncNameInputWidth();
    dom.nameInput.focus();
    dom.nameInput.select();
  });
}

function commitDisplayNameChange() {
  if (state.chat.nameChangeUsed) {
    setIdentityEditing(false);
    return;
  }

  updateDisplayName(dom.nameInput.value, dom.nameInput);
  const confirmedName = getDisplayName();
  dom.nameInput.value = confirmedName;
  syncNameInputWidth();
  if (dom.lobbyNameInput) dom.lobbyNameInput.value = confirmedName;
  state.session.transport?.updateMember?.(confirmedName);
  state.chat.nameChangeUsed = true;
  localStorage.setItem("cine-juntos-name-change-used", "1");
  logEvent("user", `Nombre actualizado: ${confirmedName}`);
  syncEditNameButtonState();
  setIdentityEditing(false);
}

export function renderMembers(members) {
  const nextMembers = new Map([[state.session.clientId, getDisplayName()]]);
  const activeIds = new Set([state.session.clientId]);

  Object.entries(members || {}).forEach(([id, member]) => {
    const memberId = member?.id || id;
    if (!memberId) return;
    nextMembers.set(memberId, member?.name || makeParticipantLabel(memberId));
    activeIds.add(memberId);
  });

  state.session.knownMembers = nextMembers;
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
  }
}

export function renderPresence() {
  if (!dom.participantCount || !dom.presencePill) return;

  renderDisplayName();

  const members = Array.from(state.session.knownMembers.entries())
    .filter(([id]) => state.session.knownParticipants.has(id))
    .map(([id, name]) =>
      id === state.session.clientId
        ? `(Vos) ${name || makeGuestName(state.session.clientId)}`
        : name || makeParticipantLabel(id),
    );

  const uniqueMembers = members.length ? members : [`(Vos) ${getDisplayName()}`];
  const selfMember = uniqueMembers.find((member) => member.startsWith("(Vos) "));
  const otherMembers = uniqueMembers.filter((member) => member !== selfMember);
  const orderedMembers = selfMember ? [selfMember, ...otherMembers] : uniqueMembers;
  const isSoloSelf = orderedMembers.length === 1 && Boolean(selfMember);
  const tooltip = `${isSoloSelf ? "Conectado" : "Conectados"}:\n${orderedMembers.join(", ")}`;
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
}

export function updateDisplayName(value, sourceInput) {
  const nextName = String(value || "").slice(0, 28);
  const lockedName = localStorage.getItem("cine-juntos-name") || makeGuestName(state.session.clientId);

  if (state.chat.nameChangeUsed) {
    if (dom.nameInput) dom.nameInput.value = lockedName;
    if (dom.lobbyNameInput) dom.lobbyNameInput.value = lockedName;
    state.session.knownMembers.set(state.session.clientId, lockedName);
    renderDisplayName(lockedName);
    renderPresence();
    return;
  }

  if (sourceInput !== dom.nameInput) dom.nameInput.value = nextName;
  if (sourceInput !== dom.lobbyNameInput) dom.lobbyNameInput.value = nextName;
  if (sourceInput === dom.nameInput) syncNameInputWidth();
  localStorage.setItem("cine-juntos-name", nextName.trim() || makeGuestName(state.session.clientId));
  state.session.knownMembers.set(state.session.clientId, getDisplayName());
  renderDisplayName();
  renderPresence();
}

export function wireIdentityEvents() {
  renderDisplayName();
  dom.nameInput.value = getDisplayName();
  nameInputBaseWidth = Math.ceil(dom.nameDisplay?.getBoundingClientRect().width || dom.nameInput.getBoundingClientRect().width || 24);
  syncNameInputWidth();
  syncEditNameButtonState();

  dom.editNameButton?.addEventListener("click", () => {
    if (state.chat.nameChangeUsed) return;
    setIdentityEditing(true);
  });

  dom.confirmNameButton?.addEventListener("click", () => {
    commitDisplayNameChange();
  });

  dom.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDisplayNameChange();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIdentityEditing(false);
    }
  });

  dom.nameInput.addEventListener("input", () => {
    syncNameInputWidth();
  });

  window.addEventListener("resize", () => {
    if (dom.chatNameField?.dataset.editing === "true") {
      syncNameInputWidth();
    }
  });
}

import { dom } from "../core/dom.js";
import { state, getDisplayName, logEvent } from "../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js";

function renderDisplayName(name = getDisplayName()) {
  if (dom.nameDisplay) {
    dom.nameDisplay.textContent = name || makeGuestName(state.session.clientId);
  }
}

function setIdentityEditing(isEditing) {
  if (!dom.chatNameField) return;
  dom.chatNameField.dataset.editing = isEditing ? "true" : "false";

  if (!isEditing) {
    dom.nameInput.value = getDisplayName();
    return;
  }

  dom.nameInput.value = getDisplayName();
  window.requestAnimationFrame(() => {
    dom.nameInput.focus();
    dom.nameInput.select();
  });
}

function commitDisplayNameChange() {
  updateDisplayName(dom.nameInput.value, dom.nameInput);
  const confirmedName = getDisplayName();
  dom.nameInput.value = confirmedName;
  if (dom.lobbyNameInput) dom.lobbyNameInput.value = confirmedName;
  state.session.transport?.updateMember?.(confirmedName);
  logEvent("user", `Nombre actualizado: ${confirmedName}`);
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
        ? `${name || makeGuestName(state.session.clientId)} (vos)`
        : name || makeParticipantLabel(id),
    );

  const uniqueMembers = members.length ? members : [`${getDisplayName()} (vos)`];
  const isSoloSelf = uniqueMembers.length === 1 && uniqueMembers[0]?.endsWith("(vos)");
  const tooltip = `${isSoloSelf ? "Conectado" : "Conectados"}: ${uniqueMembers.join(", ")}`;
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
  if (sourceInput !== dom.nameInput) dom.nameInput.value = nextName;
  if (sourceInput !== dom.lobbyNameInput) dom.lobbyNameInput.value = nextName;
  localStorage.setItem("cine-juntos-name", nextName.trim() || makeGuestName(state.session.clientId));
  state.session.knownMembers.set(state.session.clientId, getDisplayName());
  renderDisplayName();
  renderPresence();
}

export function wireIdentityEvents() {
  renderDisplayName();
  dom.nameInput.value = getDisplayName();

  dom.editNameButton?.addEventListener("click", () => {
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
}

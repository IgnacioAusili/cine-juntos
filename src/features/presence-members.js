import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { state, getDisplayName, getTransportNow } from "../core/state.js?v=20261010-file-size-refactor-02";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js?v=20261010-file-size-refactor-02";
import { normalizeDisplayName, NAME_CHANGE_LIMIT } from "../core/name-policy.js?v=20261010-file-size-refactor-02";
import { syncNameInputWidth } from "./presence-name-layout.js?v=20261010-file-size-refactor-02";
import { configurePresenceActivity, upsertParticipantRecord, isParticipantRecentlyActive, scheduleActivityRefresh } from "./presence-activity.js?v=20261010-file-size-refactor-02";

export function renderDisplayName(name = getDisplayName()) {
  if (dom.nameDisplay) {
    dom.nameDisplay.textContent = name || makeGuestName(state.session.clientId);
    syncNameInputWidth();
  }
}

function clearNameCommitReveal(editor = dom.chatNameField) {
  if (nameCommitRevealTimer !== null) {
    window.clearTimeout(nameCommitRevealTimer);
    nameCommitRevealTimer = null;
  }
  editor?.classList.remove("name-commit-stable", "name-commit-reveal");
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
    && (editor.classList.contains("name-commit-stable")
      || editor.classList.contains("name-commit-reveal"))
  ) {
    clearNameCommitReveal(editor);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setIdentityEditing(true));
    });
    return;
  }

  editor.classList.toggle("name-commit-stable", !isEditing && preserveCommittedName);
  editor.classList.toggle("name-commit-reveal", !isEditing && preserveCommittedName && animateReveal);
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
          window.requestAnimationFrame(() => editor.classList.remove("name-commit-stable"));
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

configurePresenceActivity({ renderPresence });

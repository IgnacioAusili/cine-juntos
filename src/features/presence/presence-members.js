import { dom } from "../../core/dom.js";
import { state, getDisplayName, getTransportNow } from "../../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../../core/utils.js";
import { syncNameInputWidth } from "./presence-name-layout.js";
import { configurePresenceActivity, upsertParticipantRecord, isParticipantRecentlyActive, scheduleActivityRefresh } from "./presence-activity.js";

export function renderDisplayName(name = getDisplayName()) {
  if (dom.nameDisplay) {
    dom.nameDisplay.textContent = name || makeGuestName(state.session.clientId);
    syncNameInputWidth();
  }
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

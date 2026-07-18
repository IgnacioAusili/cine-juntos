import { dom } from "../core/dom.js";
import { state, getDisplayName, logEvent } from "../core/state.js";
import { makeGuestName, makeParticipantLabel } from "../core/utils.js";

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
  if (state.session.knownMembers.has(participantId) || state.session.knownParticipants.has(participantId)) {
    state.session.knownMembers.set(
      participantId,
      participantName || state.session.knownMembers.get(participantId) || makeParticipantLabel(participantId),
    );
  }
}

export function renderPresence() {
  if (!dom.participantCount || !dom.presencePill) return;

  const members = Array.from(state.session.knownMembers.entries())
    .filter(([id]) => state.session.knownParticipants.has(id))
    .map(([id, name]) =>
      id === state.session.clientId
        ? `${name || makeGuestName(state.session.clientId)} (vos)`
        : name || makeParticipantLabel(id),
    );

  const uniqueMembers = members.length ? members : [`${getDisplayName()} (vos)`];
  const tooltip = `Conectados: ${uniqueMembers.join(", ")}`;
  const label = `${uniqueMembers.length} usuarios conectados`;

  dom.participantCount.textContent = String(uniqueMembers.length);
  dom.presencePill.dataset.tooltip = tooltip;
  dom.presencePill.removeAttribute("title");
  dom.presencePill.setAttribute("aria-label", label);

  if (dom.overlayParticipantCount && dom.overlayPresencePill) {
    dom.overlayParticipantCount.textContent = String(uniqueMembers.length);
    dom.overlayPresencePill.dataset.tooltip = tooltip;
    dom.overlayPresencePill.removeAttribute("title");
    dom.overlayPresencePill.setAttribute("aria-label", label);
  }
}

export function updateDisplayName(value, sourceInput) {
  const nextName = String(value || "").slice(0, 28);
  if (sourceInput !== dom.nameInput) dom.nameInput.value = nextName;
  if (sourceInput !== dom.lobbyNameInput) dom.lobbyNameInput.value = nextName;
  localStorage.setItem("cine-juntos-name", nextName.trim() || makeGuestName(state.session.clientId));
  state.session.knownMembers.set(state.session.clientId, getDisplayName());
  renderPresence();
}

export function wireIdentityEvents() {
  dom.nameInput.addEventListener("input", () => {
    updateDisplayName(dom.nameInput.value, dom.nameInput);
    state.session.transport?.updateMember?.(getDisplayName());
    logEvent("user", `Nombre actualizado: ${getDisplayName()}`);
  });
}

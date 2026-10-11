import { state, getTransportNow } from "../core/state.js?v=20261010-file-size-refactor-02";
import { makeParticipantLabel } from "../core/utils.js?v=20261010-file-size-refactor-02";

const RECENT_ACTIVITY_WINDOW_MS = 30000;
const recentActivityByParticipantId = new Map();
let activityRefreshTimer = null;
let renderPresenceCallback = null;

export function configurePresenceActivity({ renderPresence } = {}) { renderPresenceCallback = renderPresence || null; }
function renderCurrentPresence() { if (!renderPresenceCallback) throw new Error("La presencia debe configurar su renderizador antes de registrar actividad."); renderPresenceCallback(); }

export function getParticipantRecord(participantId) {
  return state.session.knownMemberRecords?.get(participantId) || null;
}

export function upsertParticipantRecord(participantId, nextValues = {}) {
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

export function isParticipantRecentlyActive(participantId) {
  const lastActivityAt = getParticipantActivityAt(participantId);
  return lastActivityAt > 0 && getTransportNow() - lastActivityAt <= RECENT_ACTIVITY_WINDOW_MS;
}

export function scheduleActivityRefresh() {
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
    renderCurrentPresence();
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

  renderCurrentPresence();
}

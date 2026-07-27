const PARTICIPANT_COLOR_PALETTE = [
  "#73d0ff",
  "#7ff5e5",
  "#f6c36b",
  "#ff8f7a",
  "#c7a6ff",
  "#9ee07a",
  "#ffb86b",
  "#8bd3ff",
];

export function getParticipantAccent(participantKey) {
  const key = String(participantKey || "guest");
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return PARTICIPANT_COLOR_PALETTE[hash % PARTICIPANT_COLOR_PALETTE.length];
}

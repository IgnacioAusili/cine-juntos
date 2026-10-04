import { dom } from "../core/dom.js";
import { LAST_ROOM_KEY } from "../core/state.js?v=20260914-console-log-controls-01";
import {
  ROOM_CREATE_ATTEMPT_LIMIT,
  ROOM_CREATE_ATTEMPT_WINDOW_MS,
  normalizeRoomCode,
} from "../core/utils.js";

const ROOM_CREATE_ATTEMPTS_KEY = "cine-juntos-room-create-attempts";

export function looksLikeRoomInviteUrl(value) {
  const trimmed = String(value || "").trim();
  return Boolean(
    trimmed
    && (trimmed.includes("://")
      || trimmed.startsWith("www.")
      || trimmed.startsWith("/")
      || trimmed.startsWith("?")
      || trimmed.includes("room=")),
  );
}

function extractRoomCodeFromValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  if (looksLikeRoomInviteUrl(trimmed)) {
    try {
      const inviteUrl = new URL(
        trimmed.startsWith("www.") ? "https://" + trimmed : trimmed,
        window.location.href,
      );
      const roomFromQuery = normalizeRoomCode(inviteUrl.searchParams.get("room")).slice(0, 5);
      if (roomFromQuery) return roomFromQuery;

      if (inviteUrl.hash) {
        const hashValue = inviteUrl.hash.startsWith("#") ? inviteUrl.hash.slice(1) : inviteUrl.hash;
        const hashParams = new URLSearchParams(hashValue);
        const roomFromHash = normalizeRoomCode(hashParams.get("room")).slice(0, 5);
        if (roomFromHash) return roomFromHash;
      }

      const pathMatch = inviteUrl.pathname.match(/\/([A-Z0-9]{4,12})\/?$/i);
      if (pathMatch) {
        const roomFromPath = normalizeRoomCode(pathMatch[1]).slice(0, 5);
        if (roomFromPath) return roomFromPath;
      }
    } catch {
      // Si no se puede interpretar como URL, cae al saneado normal de texto.
    }
  }

  return normalizeRoomCode(trimmed).slice(0, 5);
}

export function sanitizeRoomInput(value) {
  return extractRoomCodeFromValue(value);
}

export function rememberLastRoom(roomCode) {
  const normalizedRoom = sanitizeRoomInput(roomCode);
  if (normalizedRoom) localStorage.setItem(LAST_ROOM_KEY, normalizedRoom);
}

export function syncJoinRoomButtonState() {
  if (!dom.joinRoomButton) return;
  dom.joinRoomButton.disabled = !sanitizeRoomInput(dom.roomInput.value);
}

export function consumeRoomCreationAttempt() {
  const now = Date.now();
  let attempts = [];
  try {
    attempts = JSON.parse(localStorage.getItem(ROOM_CREATE_ATTEMPTS_KEY) || "[]");
  } catch {
    attempts = [];
  }
  attempts = Array.isArray(attempts)
    ? attempts.filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < ROOM_CREATE_ATTEMPT_WINDOW_MS)
    : [];
  if (attempts.length >= ROOM_CREATE_ATTEMPT_LIMIT) return false;
  attempts.push(now);
  localStorage.setItem(ROOM_CREATE_ATTEMPTS_KEY, JSON.stringify(attempts));
  return true;
}

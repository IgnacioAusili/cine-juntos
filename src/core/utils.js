export const FIREBASE_VERSION = "10.12.5";
export const EXAMPLE_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
export const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😮", "😢", "😡", "👍", "👏", "🔥", "✨", "❤️", "💜", "🍿", "🎬", "🌙", "⭐"];
export const REMOTE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"];
export const REMOTE_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
export const MAX_RENDERED_MESSAGES = 100;
export const MAX_ROOM_PARTICIPANTS = 8;
export const CHAT_DOCKS = ["right", "bottom", "top"];
export const CHAT_DOCK_META = {
  right: { icon: "panel-right", next: "bottom", label: "lateral", tooltip: "Mover chat abajo" },
  bottom: { icon: "panel-bottom", next: "top", label: "abajo", tooltip: "Mover chat arriba" },
  top: { icon: "panel-top", next: "right", label: "arriba", tooltip: "Mover chat al lateral" },
};
export const FULLSCREEN_SNAP_DELAY_MS = 90;
export const FULLSCREEN_SNAP_THRESHOLD = 52;
export const FULLSCREEN_END_GAP = 28;
export const MAX_DRIFT_SECONDS = 0.45;
export const SEND_THROTTLE_MS = 650;
export const MAX_CHARS = 600;

export function hasFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.databaseURL && config.projectId && config.appId);
}

export function makeGuestName(clientId) {
  const suffix = String(clientId || "").slice(-4).toUpperCase();
  return suffix ? `Usuario ${suffix}` : "Usuario";
}

export function makeParticipantLabel(participantId) {
  return `Usuario ${String(participantId).slice(-4).toUpperCase()}`;
}

export function getOrCreateClientId() {
  const stored = localStorage.getItem("cine-juntos-client-id");
  if (stored) return stored;
  const next = crypto.randomUUID();
  localStorage.setItem("cine-juntos-client-id", next);
  return next;
}

export function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).replace(/\s*a\.\s*m\.?$/i, "a.m.").replace(/\s*p\.\s*m\.?$/i, "p.m.");
}

export function formatSeconds(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds)) return "0.0s";
  return `${seconds.toFixed(1)}s`;
}

export function formatClockTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export function generateRoomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

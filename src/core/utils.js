export const FIREBASE_VERSION = "10.12.5";
export const EXAMPLE_VIDEO_URL = "https://cdn.truefilesize.com/mp4/sample-200mb.mp4";
export const EMOJI_PICKER_ITEMS = [
  // Alegria y afecto.
  { emoji: "😊", tags: ["sonrisa", "feliz"] },
  { emoji: "😂", tags: ["risa", "carcajada"] },
  { emoji: "🤣", tags: ["jajaja", "risota"] },
  { emoji: "😉", tags: ["guiño", "complice"] },
  { emoji: "🥰", tags: ["enamorado", "amoroso"] },
  { emoji: "😍", tags: ["amor", "adoracion"] },
  { emoji: "🥺", tags: ["tierno", "suplicar"] },
  { emoji: "🥹", tags: ["emocion", "orgullo"] },
  { emoji: "😏", tags: ["coqueto", "picardia"] },
  { emoji: "🫦", tags: ["morder", "labios"] },
  { emoji: "🤤", tags: ["antojo", "babear"] },
  { emoji: "🥳", tags: ["fiesta", "celebrar"] },

  // Gestos, estados y reacciones.
  { emoji: "😳", tags: ["sonrojo", "vergüenza"] },
  { emoji: "🤔", tags: ["duda", "pensar"] },
  { emoji: "🤨", tags: ["sospecha", "desconfianza"] },
  { emoji: "😕", tags: ["confundido", "confusion"] },
  { emoji: "🤯", tags: ["asombro", "explosion"] },
  { emoji: "😎", tags: ["cool", "genial"] },
  { emoji: "😱", tags: ["miedo", "susto"] },
  { emoji: "😮‍💨", tags: ["suspiro", "alivio"] },
  { emoji: "🤫", tags: ["silencio", "secreto"] },
  { emoji: "🙈", tags: ["esconderse", "vergonzoso"] },
  { emoji: "🫣", tags: ["mirar", "curioso"] },

  // Tristeza y dolor.
  { emoji: "😔", tags: ["triste", "melancolia"] },
  { emoji: "😭", tags: ["lloro", "lagrimas"] },
  { emoji: "💔", tags: ["desamor", "herido"] },

  // Enojo y rechazo.
  { emoji: "😡", tags: ["enojo", "furia"] },
  { emoji: "🤮", tags: ["asco", "nausea"] },
  { emoji: "😒", tags: ["fastidio", "molesto"] },
  { emoji: "❌", tags: ["no", "error"] },
  { emoji: "👎", tags: ["mal", "desacuerdo"] },

  // Aprobacion.
  { emoji: "✅", tags: ["ok", "correcto"] },
  { emoji: "👍", tags: ["bien", "aprobado"] },
  { emoji: "🙂‍↕️", tags: ["asentir", "aceptar"] },
  { emoji: "🙏", tags: ["gracias", "favor"] },
];
export const EMOJIS = EMOJI_PICKER_ITEMS.map((item) => item.emoji);

const EMOJI_SHORTCUT_MAP = new Map(
  EMOJI_PICKER_ITEMS.flatMap((item) => item.tags.map((tag) => [tag.toLowerCase(), item.emoji])),
);

const EMOJI_SHORTCUT_PATTERN = new RegExp(
  `:(${Array.from(EMOJI_SHORTCUT_MAP.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")}):`,
  "gi",
);
export const REMOTE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"];
export const REMOTE_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
export const CHAT_VIDEO_PREVIEW_MAX_SECONDS = 5 * 60;
export const MAX_RENDERED_MESSAGES = 100;
export const MAX_ROOM_PARTICIPANTS = 8;
export const GUEST_ANIMALS = [
  "Lobo",
  "Jaguar",
  "Lince",
  "Halcón",
  "Cuervo",
  "Búho",
  "Zorro",
  "León",
  "Tigre",
  "Pantera",
  "Cobra",
  "Orca",
  "Oso",
  "Puma",
  "Águila",
  "Delfín",
  "Fénix",
  "Koala",
  "Cóndor",
  "Bisonte",
];
export const GUEST_ADJECTIVES = [
  "Astral",
  "Boreal",
  "Carmesí",
  "Sombrío",
  "Glacial",
  "Celestial",
  "Arcano",
  "Eterno",
  "Salvaje",
  "Imperial",
  "Dorado",
  "Plateado",
  "Espectral",
  "Místico",
  "Ancestral",
  "Sigiloso",
  "Aurora",
  "Trueno",
  "Eclipse",
  "Relámpago",
];
export const CHAT_DOCKS = ["right", "bottom"];
export const CHAT_DOCK_META = {
  right: { icon: "panel-right", next: "bottom", label: "lateral", tooltip: "Mover chat abajo" },
  bottom: { icon: "panel-bottom", next: "right", label: "abajo", tooltip: "Mover chat al lateral" },
};
export const FULLSCREEN_SNAP_DELAY_MS = 90;
export const FULLSCREEN_SNAP_THRESHOLD = 52;
export const FULLSCREEN_END_GAP = 28;
export const MAX_DRIFT_SECONDS = 0.45;
export const SOFT_DRIFT_SECONDS = 0.9;
export const HARD_DRIFT_SECONDS = 1.8;
export const PLAYBACK_ERROR_CONFIRMATION_MS = 900;
export const SEND_THROTTLE_MS = 650;
export const MAX_CHARS = 300;

export function hasFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.databaseURL && config.projectId && config.appId);
}

export function makeGuestName(clientId) {
  const animal = GUEST_ANIMALS[Math.floor(Math.random() * GUEST_ANIMALS.length)];
  const adjective = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)];
  return `${animal} ${adjective}`;
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
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  if (!Number.isFinite(totalSeconds)) return "0:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export function formatClockTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export function withShortcutHint(label, shortcut) {
  if (!label) return "";
  if (!shortcut) return label;
  return `${label} (${shortcut})`;
}

export function replaceEmojiShortcodes(value) {
  const text = String(value || "");
  if (!text || EMOJI_SHORTCUT_MAP.size === 0) return text;

  return text.replace(EMOJI_SHORTCUT_PATTERN, (match, rawTag) => {
    const emoji = EMOJI_SHORTCUT_MAP.get(String(rawTag || "").toLowerCase());
    return emoji || match;
  });
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

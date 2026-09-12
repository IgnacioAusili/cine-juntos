// Reglas compartidas para el nombre visible y su cupo de cambios.
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const NAME_CHANGE_LIMIT = 5;

export function normalizeDisplayName(value) {
  return String(value || "").trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
}

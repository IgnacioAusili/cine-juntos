const DEFAULT_PARTICIPANT_NAME = "Invitado";
const FNV_OFFSET_BASIS_64 = 14695981039346656037n;
const FNV_PRIME_64 = 1099511628211n;
const SPLIT_MIX_MULTIPLIER_1 = 13787848793156543929n;
const SPLIT_MIX_MULTIPLIER_2 = 10723151780598845931n;
const UINT53_RANGE = 9007199254740992;
const UINT16_MAX = 65535;

function normalizeParticipantName(participantName) {
  const name = String(participantName ?? "")
    .trim()
    .normalize("NFC")
    .toLowerCase();

  return name || DEFAULT_PARTICIPANT_NAME.toLowerCase();
}

function hashParticipantName(name) {
  let hash = FNV_OFFSET_BASIS_64;

  for (const character of name) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * FNV_PRIME_64);
  }

  // Mezcla los bits finales para que nombres similares no produzcan colores
  // similares por compartir una parte del hash.
  hash ^= hash >> 30n;
  hash = BigInt.asUintN(64, hash * SPLIT_MIX_MULTIPLIER_1);
  hash ^= hash >> 27n;
  hash = BigInt.asUintN(64, hash * SPLIT_MIX_MULTIPLIER_2);
  hash ^= hash >> 31n;

  return BigInt.asUintN(64, hash);
}

function getHashFraction(hash, offset = 0) {
  const bits = Number((hash >> BigInt(offset)) & 0xffffn);
  return bits / UINT16_MAX;
}

function oklchToLinearRgb(lightness, chroma, hue) {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [red, green, blue];
}

function isInSrgbGamut(channels) {
  return channels.every((channel) => channel >= 0 && channel <= 1);
}

function getGamutMappedChroma(lightness, chroma, hue) {
  if (isInSrgbGamut(oklchToLinearRgb(lightness, chroma, hue))) return chroma;

  let min = 0;
  let max = chroma;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const candidate = (min + max) / 2;
    if (isInSrgbGamut(oklchToLinearRgb(lightness, candidate, hue))) {
      min = candidate;
    } else {
      max = candidate;
    }
  }

  return min;
}

function linearRgbToCssColor(channels) {
  const encodedChannels = channels.map((channel) => {
    const clamped = Math.max(0, Math.min(1, channel));
    const srgbChannel =
      (clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255;
    return srgbChannel.toFixed(6);
  });

  return `rgb(${encodedChannels.join(", ")})`;
}

function oklchToCssColor(lightness, chroma, hue) {
  const gamutMappedChroma = getGamutMappedChroma(lightness, chroma, hue);
  return linearRgbToCssColor(oklchToLinearRgb(lightness, gamutMappedChroma, hue));
}

/**
 * Devuelve un color estable basado únicamente en el nombre visible del usuario.
 * Los parámetros se generan en OKLCH, donde la distancia entre colores es más
 * uniforme para el ojo, y luego se convierten a RGB con precisión decimal para
 * no perder diferencias al redondear a una paleta de 24 bits.
 */
export function getParticipantAccent(participantName) {
  const name = normalizeParticipantName(participantName);
  const hash = hashParticipantName(name);
  const hue = Number(hash >> 11n) / UINT53_RANGE * 360;
  const lightness = 0.76 + getHashFraction(hash, 0) * 0.08;
  const chroma = 0.13 + getHashFraction(hash, 16) * 0.045;

  return oklchToCssColor(lightness, chroma, hue);
}

const EMOJI_ONLY_PATTERN = /^(?:[\s\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\uFE0F\u200D\u20E3])+$/u;
const EMOJI_GLYPH_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

export function getSystemMessageText(message, isMine) {
  const videoEvent = message.videoEvent;
  if (videoEvent?.action === "video-ready" && videoEvent.isReload) {
    return isMine
      ? "Se te ha recargado el video"
      : `${String(message.name || "Invitado").trim()} le ha recargado el video`;
  }
  return String(message.text || "").trim();
}
export function normalizeOwnSystemBody(bodyText) {
  if (/^tiene inconvenientes en el video\b/i.test(bodyText)) {
    return bodyText.replace(/^tiene\b/i, "Tienes");
  }

  const rules = [
    [/^inició el video$/i, "Iniciaste el video"],
    [/^ingresó un video$/i, "Ingresaste un video"],
    [/^reprodujo el video en (.+)$/i, "Reprodujiste el video en $1"],
    [/^pausó el video en (.+)$/i, "Pausaste el video en $1"],
    [/^saltó a (.+)$/i, "Saltaste a $1"],
    [/^cambió la velocidad a (.+)$/i, "Cambiaste la velocidad a $1"],
    [/^le ha cargado el video$/i, "Se te ha cargado el video"],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(bodyText)) {
      return bodyText.replace(pattern, replacement);
    }
  }

  return "";
}

export function isEmojiOnlyText(text) {
  const value = String(text || "").trim();
  return Boolean(value) && EMOJI_GLYPH_PATTERN.test(value) && EMOJI_ONLY_PATTERN.test(value);
}

export function countEmojiGlyphs(text) {
  const value = String(text || "").trim();
  if (!value) return 0;

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].filter(({ segment }) => EMOJI_GLYPH_PATTERN.test(segment)).length;
  }

  return [...value].filter((character) => EMOJI_GLYPH_PATTERN.test(character)).length;
}

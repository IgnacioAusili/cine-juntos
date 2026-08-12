export function installMiniPlayerWindowStyles(targetDocument) {
  const emojiFont = targetDocument.createElement("link");
  emojiFont.rel = "stylesheet";
  emojiFont.href = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";
  targetDocument.head.append(emojiFont);

  [
    "../../../public/styles.css?v=20260808-mini-player-13",
    "../../../public/styles/mini-player-window.css?v=20260808-mini-player-12",
  ].forEach((path) => {
    const stylesheet = targetDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL(path, import.meta.url).href;
    targetDocument.head.append(stylesheet);
  });
  targetDocument.fonts?.load('1rem "Noto Color Emoji"', "😂🫦").catch(() => {});
  targetDocument.body.classList.add("app-ready");
}

export function createMiniPlayerSurface(targetDocument, chatStyle) {
  const surface = targetDocument.createElement("section");
  surface.className = "mini-player-surface player-frame player-overlay-visible";
  surface.classList.add("mini-player-initializing");
  surface.style.visibility = "hidden";
  surface.style.opacity = "0";
  surface.dataset.chatStyle = chatStyle || "float";
  surface.setAttribute("aria-label", "Mini-reproductor");
  return surface;
}

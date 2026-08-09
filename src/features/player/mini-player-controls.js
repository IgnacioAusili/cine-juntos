export function installMiniPlayerWindowStyles(targetDocument) {
  [
    "../../../public/styles.css?v=20260808-mini-player-13",
    "../../../public/styles/mini-player-window.css?v=20260808-mini-player-12",
  ].forEach((path) => {
    const stylesheet = targetDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL(path, import.meta.url).href;
    targetDocument.head.append(stylesheet);
  });
  targetDocument.body.classList.add("app-ready");
}

export function createMiniPlayerSurface(targetDocument, chatStyle) {
  const surface = targetDocument.createElement("section");
  surface.className = "mini-player-surface player-frame player-overlay-visible";
  surface.dataset.chatStyle = chatStyle || "float";
  surface.setAttribute("aria-label", "Mini-reproductor");
  return surface;
}

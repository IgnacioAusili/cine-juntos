import { observePlayerControlLayouts } from "./player-controls-layout.js?v=20260929-player-controls-layout-resize-reflow-02";
import { observePlayerVolumeLayouts } from "./player-volume-layout.js?v=20260928-volume-popup-arrow-hide-01";

export function installMiniPlayerWindowStyles(targetDocument) {
  const emojiFont = targetDocument.createElement("link");
  emojiFont.rel = "stylesheet";
  emojiFont.href = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";
  targetDocument.head.append(emojiFont);

  const stylesheets = [
    "../../../public/styles.css?v=20260928-bottom-chat-expand-gap-01-room-chip-bottom-padding-01-volume-popup-arrow-hide-01-system-row-fixed-center-01-chat-name-dynamic-01-pending-image-lightbox-01-preview-size-center-01-overlay-image-size-01-hidden-scrollbar-02-chat-tools-shared-gutter-01-presence-svg-remove-scale-01-header-landscape-compact-01-component-stack-header-pc-gutter-01-component-stack-header-pc-gutter-02-component-stack-header-input-mode-01-component-stack-header-measured-gutter-01-component-stack-header-edge-geometry-02",
    "../../../public/styles/mini-player-window.css?v=20260808-mini-player-12",
  ].map((path) => {
    const stylesheet = targetDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL(path, import.meta.url).href;
    targetDocument.head.append(stylesheet);
    return new Promise((resolve) => {
      stylesheet.addEventListener("load", resolve, { once: true });
      stylesheet.addEventListener("error", resolve, { once: true });
      targetDocument.defaultView?.setTimeout(resolve, 1200);
    });
  });
  targetDocument.fonts?.load('1rem "Noto Color Emoji"', "😂🫦").catch(() => {});
  targetDocument.body.classList.add("app-ready");
  return Promise.all(stylesheets);
}

export function createMiniPlayerSurface(
  targetDocument,
  chatStyle,
  chatVisible = false,
  controlStyle = "line",
) {
  const surface = targetDocument.createElement("section");
  surface.className = "mini-player-surface player-frame player-overlay-visible";
  surface.classList.toggle("chat-inside-open", Boolean(chatVisible));
  surface.classList.add("mini-player-initializing");
  surface.style.visibility = "hidden";
  surface.style.opacity = "0";
  surface.dataset.chatStyle = chatStyle || "float";
  surface.dataset.controlStyle = controlStyle || "line";
  surface.setAttribute("aria-label", "Mini-reproductor");
  observePlayerControlLayouts(surface);
  observePlayerVolumeLayouts(surface);
  return surface;
}

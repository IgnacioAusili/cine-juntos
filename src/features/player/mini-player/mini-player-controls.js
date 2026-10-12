import { observePlayerControlLayouts } from "../controls/player-controls-layout.js";
import { observePlayerVolumeLayouts } from "../controls/player-volume-layout.js";

const MINI_PLAYER_WINDOW_STYLESHEET_URL = new URL(
  "../../../../public/styles/mini-player/mini-player-window.css",
  import.meta.url,
).href;
const MINI_PLAYER_WINDOW_FALLBACK_CSS = `
:root {
  background: #050607;
}

body.page-context--ready {
  min-width: 320px;
  min-height: 210px;
  overflow: hidden;
  background: #050607;
}

.mini-player-surface {
  width: 100%;
  height: 100dvh;
  min-height: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
`;

export function installMiniPlayerWindowStyles(targetDocument) {
  targetDocument.body.classList.add('page-context--ready');
  copyLoadedFonts(targetDocument);

  const StyleSheetConstructor = targetDocument.defaultView?.CSSStyleSheet;
  if (
    typeof StyleSheetConstructor !== "function"
    || !Array.isArray(targetDocument.adoptedStyleSheets)
  ) {
    return installLinkedMiniPlayerStyles(targetDocument);
  }

  return installAdoptedMiniPlayerStyles(targetDocument, StyleSheetConstructor);
}

export function createMiniPlayerSurface(
  targetDocument,
  chatStyle,
  chatVisible = false,
  controlStyle = "line",
) {
  const surface = targetDocument.createElement("section");
  surface.className = 'mini-player-surface player-frame player-frame--overlay-visible';
  surface.classList.toggle('u-chat-inside-open', Boolean(chatVisible));
  surface.classList.add('mini-player-surface--initializing');
  surface.style.visibility = "hidden";
  surface.style.opacity = "0";
  surface.dataset.chatStyle = chatStyle || "float";
  surface.dataset.controlStyle = controlStyle || "line";
  surface.setAttribute("aria-label", "Mini-reproductor");
  observePlayerControlLayouts(surface);
  observePlayerVolumeLayouts(surface);
  return surface;
}

async function installAdoptedMiniPlayerStyles(targetDocument, StyleSheetConstructor) {
  const stylesheetUrl = new URL(MINI_PLAYER_WINDOW_STYLESHEET_URL);
  let miniPlayerCss = MINI_PLAYER_WINDOW_FALLBACK_CSS;
  try {
    const response = await fetch(stylesheetUrl);
    if (!response.ok) {
      throw new Error(`No se pudo cargar el CSS del mini-reproductor (${response.status}).`);
    }
    miniPlayerCss = absolutizeCssUrls(await response.text(), stylesheetUrl.href);
  } catch (error) {
    console.warn("Se usa el CSS base del mini-reproductor.", error);
  }

  const applicationCss = collectApplicationCss();
  const adoptedStylesheet = new StyleSheetConstructor();
  try {
    adoptedStylesheet.replaceSync(`${applicationCss}\n${miniPlayerCss}`);
  } catch (error) {
    console.warn("No se pudieron copiar todos los estilos del mini-reproductor.", error);
    adoptedStylesheet.replaceSync(MINI_PLAYER_WINDOW_FALLBACK_CSS);
  }
  targetDocument.adoptedStyleSheets = [
    ...targetDocument.adoptedStyleSheets,
    adoptedStylesheet,
  ];
}

function installLinkedMiniPlayerStyles(targetDocument) {
  const stylesheets = [
    ...getApplicationStylesheetUrls(),
    MINI_PLAYER_WINDOW_STYLESHEET_URL,
  ].map((href) => {
    const stylesheet = targetDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    targetDocument.head.append(stylesheet);
    return new Promise((resolve) => {
      stylesheet.addEventListener("load", resolve, { once: true });
      stylesheet.addEventListener("error", resolve, { once: true });
      targetDocument.defaultView?.setTimeout(resolve, 1200);
    });
  });
  return Promise.all(stylesheets);
}

function getApplicationStylesheetUrls() {
  return [...document.styleSheets]
    .filter((stylesheet) => {
      if (!stylesheet.href) return false;
      try {
        return new URL(stylesheet.href, document.baseURI).origin === window.location.origin;
      } catch {
        return false;
      }
    })
    .map((stylesheet) => stylesheet.href);
}

function collectApplicationCss() {
  const stylesheets = [...document.styleSheets].filter((stylesheet) => {
    if (!stylesheet.href) return true;
    try {
      return new URL(stylesheet.href).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  return stylesheets.flatMap((stylesheet) => collectStylesheetRules(stylesheet)).join("\n");
}

function collectStylesheetRules(stylesheet, ancestors = new Set()) {
  if (!stylesheet || ancestors.has(stylesheet)) return [];

  const stylesheetAncestors = new Set(ancestors);
  stylesheetAncestors.add(stylesheet);

  let rules;
  try {
    rules = [...stylesheet.cssRules];
  } catch {
    return [];
  }

  const cssText = rules.flatMap((rule) => {
    if (rule.type === CSSRule.IMPORT_RULE) {
      const importedCss = collectStylesheetRules(rule.styleSheet, stylesheetAncestors).join("\n");
      const mediaText = rule.media?.mediaText;
      return mediaText && mediaText !== "all"
        ? [`@media ${mediaText} {\n${importedCss}\n}`]
        : [importedCss];
    }

    const baseUrl = rule.parentStyleSheet?.href || stylesheet.href || document.baseURI;
    return [absolutizeCssUrls(rule.cssText, baseUrl)];
  }).join("\n");

  const mediaText = stylesheet.media?.mediaText;
  return mediaText && mediaText !== "all"
    ? [`@media ${mediaText} {\n${cssText}\n}`]
    : [cssText];
}

function absolutizeCssUrls(cssText, baseUrl) {
  return cssText.replace(/url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi, (match, quote, quotedUrl, bareUrl) => {
    const value = (quotedUrl ?? bareUrl ?? "").trim();
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return match;

    try {
      return `url("${new URL(value, baseUrl).href}")`;
    } catch {
      return match;
    }
  });
}

function copyLoadedFonts(targetDocument) {
  for (const fontFace of document.fonts) {
    try {
      targetDocument.fonts.add(fontFace);
    } catch {
      // Las fuentes que no se puedan compartir usan el fallback local del sistema.
    }
  }
}

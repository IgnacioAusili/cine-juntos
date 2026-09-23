import { resetLobbyTicketPlacement, syncLobbyTicketPlacement, syncLobbyTitlePlacement } from "./lobby-ticket-placement.js?v=20260922-lobby-ticket-track-center-02";

const STORAGE_KEY = "cine-juntos-lobby-layout-variant";
const DEFAULT_VARIANT = "columns";

const VARIANT_VALUES = new Set(["stacked", "columns", "hero", "compact"]);

function getSavedVariant() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VARIANT_VALUES.has(value) ? value : DEFAULT_VARIANT;
  } catch {
    return DEFAULT_VARIANT;
  }
}

function saveVariant(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // El selector sigue funcionando aunque el navegador bloquee storage.
  }
}

function applyVariant(select, value) {
  const nextValue = VARIANT_VALUES.has(value) ? value : DEFAULT_VARIANT;
  document.body.dataset.lobbyLayout = nextValue;
  if (select) select.value = nextValue;
}

let lobbyCenterFrame = 0;

const TITLE_FIT_MIN_SCALE = 0.68;
const TITLE_FIT_MIN_SIZE_PX = 48;
const TITLE_FIT_MAX_SIZE_REM = 6.8;
const TITLE_FIT_GAP_PX = 12;
const TITLE_FIT_SAFE_SPACE_PX = 8;

function getVisibleRect(element) {
  const viewport = {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  };
  const visible = { ...viewport };

  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
    const clipsY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
    if (!clipsX && !clipsY) continue;

    const rect = parent.getBoundingClientRect();
    if (clipsX) {
      visible.left = Math.max(visible.left, rect.left);
      visible.right = Math.min(visible.right, rect.right);
    }
    if (clipsY) {
      visible.top = Math.max(visible.top, rect.top);
      visible.bottom = Math.min(visible.bottom, rect.bottom);
    }
  }

  return visible;
}

function titleNeedsFitting(title, hero, ticket) {
  const lineRects = [...title.querySelectorAll(".lobby-title-line")]
    .map((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      const rect = range.getBoundingClientRect();
      range.detach();
      return rect;
    });
  if (!lineRects.length) return false;

  const visualRect = lineRects.reduce((bounds, rect) => ({
    left: Math.min(bounds.left, rect.left),
    top: Math.min(bounds.top, rect.top),
    right: Math.max(bounds.right, rect.right),
    bottom: Math.max(bounds.bottom, rect.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const visibleRect = getVisibleRect(title);
  const heroRect = hero.getBoundingClientRect();
  const iconRect = hero.querySelector(".lobby-title-icon")?.getBoundingClientRect();
  const columnGap = Number.parseFloat(getComputedStyle(hero).columnGap) || 0;
  const ticketRect = ticket?.getBoundingClientRect();
  const rightLimit = ticketRect
    ? Math.min(heroRect.right, ticketRect.left - TITLE_FIT_GAP_PX) - TITLE_FIT_SAFE_SPACE_PX
    : heroRect.right - TITLE_FIT_SAFE_SPACE_PX;

  const availableLeft = Math.max(visibleRect.left, heroRect.left);
  const availableRight = Math.min(visibleRect.right, rightLimit);
  const groupWidth = iconRect
    ? iconRect.width + columnGap + (visualRect.right - visualRect.left)
    : visualRect.right - visualRect.left;

  return visualRect.left < availableLeft - 1
    || visualRect.top < visibleRect.top
    || visualRect.right > availableRight
    || visualRect.bottom > visibleRect.bottom + 1
    || groupWidth > availableRight - availableLeft;
}

function setTitleFitSize(title, size) {
  title.style.setProperty("--lobby-title-size", `${size}px`);
  title.style.setProperty("font-size", `${size}px`);
}

function resetTitleFit(title) {
  title?.style.removeProperty("--lobby-title-size");
  title?.style.removeProperty("font-size");
}

function titleNeedsLayoutFitting(title, hero, ticket, layoutTicket, footer) {
  if (titleNeedsFitting(title, hero, ticket)) return true;
  if (!layoutTicket || !footer) return false;

  const ticketRect = layoutTicket.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  return ticketRect.bottom > footerRect.top + 0.5;
}

function syncLobbyTitleFit(screen, hero, ticket) {
  const title = screen.querySelector(".lobby-title");
  if (!title) return;

  const layoutTicket = screen.querySelector(".lobby-ticket");
  const footer = screen.querySelector(".lobby-footer");
  const needsFitting = (size) => {
    setTitleFitSize(title, size);
    return titleNeedsLayoutFitting(title, hero, ticket, layoutTicket, footer);
  };

  resetTitleFit(title);
  const baseSize = Number.parseFloat(getComputedStyle(title).fontSize);
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const maximumSize = Number.isFinite(rootFontSize)
    ? rootFontSize * TITLE_FIT_MAX_SIZE_REM
    : baseSize;
  if (!Number.isFinite(baseSize) || !Number.isFinite(maximumSize)) return;

  const lowLimit = Math.min(maximumSize, Math.max(TITLE_FIT_MIN_SIZE_PX, baseSize * TITLE_FIT_MIN_SCALE));
  if (!needsFitting(maximumSize)) return;

  let low = lowLimit;
  let high = maximumSize;
  needsFitting(lowLimit);

  if (titleNeedsLayoutFitting(title, hero, ticket, layoutTicket, footer)) return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const middle = (low + high) / 2;
    if (needsFitting(middle)) high = middle;
    else low = middle;
  }

  setTitleFitSize(title, low);
}

function syncLobbyContentCenter() {
  lobbyCenterFrame = 0;

  const isColumns = document.body.dataset.lobbyLayout === "columns";
  const screen = document.querySelector("#lobbyScreen");
  const marquee = screen?.querySelector(".lobby-marquee");
  const footer = screen?.querySelector(".lobby-footer");
  const grid = screen?.querySelector(".lobby-grid");
  const content = screen
    ? [...screen.querySelectorAll(".lobby-hero, .lobby-ticket")]
    : [];
  const hero = screen?.querySelector(".lobby-hero");
  const ticket = screen?.querySelector(".lobby-ticket");

  // En el modo columns primero se prueba la composición real. Si un título
  // de prestaciones queda recortado en su tarjeta, el ancho restante ya no
  // alcanza para mostrar ambas columnas con claridad y el grid pasa a una.
  if (isColumns && grid) document.body.dataset.lobbyFlow = "columns";
  const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/) : [];
  const featureHeadings = hero ? [...hero.querySelectorAll(".lobby-feature-text strong")] : [];
  const hasClippedFeatureHeading = featureHeadings.some((heading) => (
    heading.getClientRects().length > 0
      && heading.clientWidth > 0
      && heading.scrollWidth > heading.clientWidth + 1
  ));
  const isSingleColumn = Boolean(grid) && (
    gridColumns.length < 2 || (isColumns && hasClippedFeatureHeading)
  );
  document.body.dataset.lobbyFlow = isSingleColumn ? "single-column" : "columns";
  syncLobbyTitlePlacement(screen, isSingleColumn);

  if (!grid || content.length !== 2) {
    resetTitleFit(screen?.querySelector(".lobby-title"));
    resetLobbyTicketPlacement(screen, ticket);
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    resetSingleColumnDescriptionPlacement(hero);
    grid?.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  if (isSingleColumn) {
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    grid.style.removeProperty("--lobby-vertical-content-gap");
    // En una sola columna el boleto está debajo; no debe limitar el título
    // como si ocupara una segunda columna lateral.
    syncLobbyTitleFit(screen, hero, null);
    syncLobbyTitlePlacement(screen, true);
    syncSingleColumnTitleGroup(hero);
    syncSingleColumnContentGap(grid, ticket, footer);
    syncSingleColumnDescriptionPlacement(hero, ticket);
    syncLobbyTitlePlacement(screen, true);
    return;
  }

  resetSingleColumnDescriptionPlacement(hero);
  resetSingleColumnTitleLift(hero);
  resetSingleColumnTitleGroup(hero);

  if (!isColumns || !marquee || !footer) {
    resetTitleFit(screen?.querySelector(".lobby-title"));
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // Medimos siempre desde la posición base para no acumular el desplazamiento
  // anterior al cambiar de viewport o al cambiar la variante.
  grid.style.setProperty("--lobby-content-center-shift", "0px");
  syncLobbyTicketPlacement(screen, ticket);
  syncLobbyTitleFit(screen, hero, ticket);
  syncLobbyTitlePlacement(screen, false);

  const marqueeRect = marquee.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const contentRects = content.map((element) => element.getBoundingClientRect());
  const contentTop = Math.min(...contentRects.map((rect) => rect.top));
  const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));
  const availableCenter = (marqueeRect.bottom + footerRect.top) / 2;
  const contentCenter = (contentTop + contentBottom) / 2;
  const shift = availableCenter - contentCenter;

  if (Number.isFinite(shift)) {
    grid.style.setProperty("--lobby-content-center-shift", `${shift.toFixed(2)}px`);
  }
}

function scheduleLobbyContentCenter() {
  if (lobbyCenterFrame) cancelAnimationFrame(lobbyCenterFrame);
  lobbyCenterFrame = requestAnimationFrame(syncLobbyContentCenter);
}

function syncSingleColumnDescriptionPlacement(hero, ticket) {
  if (!hero || !ticket) return;

  // Medimos desde cero para no acumular el desplazamiento al redimensionar.
  hero.style.setProperty("--lobby-description-separator-shift", "0px");

  const title = hero.querySelector(".lobby-title");
  const description = hero.querySelector(".lobby-description");
  if (!title || !description) return;

  const separatorStyle = getComputedStyle(hero, "::before");
  const separatorTop = Number.parseFloat(separatorStyle.top);
  const separatorHeight = Number.parseFloat(separatorStyle.height);
  if (!Number.isFinite(separatorTop) || !Number.isFinite(separatorHeight) || separatorHeight <= 0) return;

  const heroRect = hero.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  const descriptionRect = description.getBoundingClientRect();
  const ticketRect = ticket.getBoundingClientRect();
  const separatorBottom = heroRect.top + separatorTop + separatorHeight;
  const topGap = descriptionRect.top - titleRect.bottom;
  const bottomGap = ticketRect.top - separatorBottom;
  const shift = (bottomGap - topGap) / 2;

  if (Number.isFinite(shift)) {
    hero.style.setProperty("--lobby-description-separator-shift", `${shift.toFixed(2)}px`);
  }
}

function syncSingleColumnContentGap(grid, ticket, footer) {
  if (!grid || !ticket || !footer) return;

  // Cada ciclo parte de la separación declarada por CSS y solo la reduce si
  // el contenido real invade el espacio ocupado por el footer fijo.
  grid.style.removeProperty("--lobby-vertical-content-gap");
  const baseGap = Number.parseFloat(getComputedStyle(grid).rowGap);
  if (!Number.isFinite(baseGap)) return;

  const ticketRect = ticket.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const overlap = ticketRect.bottom - footerRect.top;
  if (overlap <= 0) return;

  const gap = Math.max(0, baseGap - overlap);
  grid.style.setProperty("--lobby-vertical-content-gap", `${gap.toFixed(2)}px`);
}

function getTitleGlyphTopOffset(title) {
  const line = title.querySelector(".lobby-title-line");
  if (!line) return 0;

  const style = getComputedStyle(title);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight)) return 0;

  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = style.font;
  const metrics = context.measureText(line.textContent || "");
  const fontAscent = metrics.fontBoundingBoxAscent;
  const fontDescent = metrics.fontBoundingBoxDescent;
  const actualAscent = metrics.actualBoundingBoxAscent;
  if (![fontAscent, fontDescent, actualAscent].every(Number.isFinite)) return 0;

  const leading = (lineHeight - fontAscent - fontDescent) / 2;
  return leading + fontAscent - actualAscent;
}

function syncSingleColumnTitleLift(hero) {
  const title = hero?.querySelector(".lobby-title");
  if (!title) return;

  title.style.removeProperty("--lobby-title-lift");
  const visible = getVisibleRect(title);
  const line = title.querySelector(".lobby-title-line");
  if (!line || !Number.isFinite(visible.top)) return;

  // La referencia es la tinta real de la fuente y el viewport visible, no una
  // altura o anchura concreta de pantalla. El pequeño margen se expresa en
  // relación con la tipografía raíz para que acompañe la escala del entorno.
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const targetInset = Number.isFinite(rootFontSize)
    ? Math.max(0, rootFontSize * 0.3 - 5)
    : 0;
  const lineTop = line.getBoundingClientRect().top;
  const glyphTop = lineTop + getTitleGlyphTopOffset(title);
  const lift = glyphTop - visible.top - targetInset;
  title.style.setProperty("--lobby-title-lift", `${lift.toFixed(2)}px`);
}

function syncSingleColumnTitleGroup(hero) {
  const title = hero?.querySelector(".lobby-title");
  const icon = hero?.querySelector(".lobby-title-icon");
  if (!hero || !title || !icon) return;

  hero.style.removeProperty("--lobby-title-group-shift");
  const heroRect = hero.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(hero).columnGap) || 0;
  const visible = getVisibleRect(title);
  const groupLeft = titleRect.left - iconRect.width - gap;
  const groupRight = titleRect.right;
  const leftLimit = Math.max(heroRect.left, visible.left);
  const rightLimit = Math.min(heroRect.right, visible.right);
  const shift = groupLeft < leftLimit
    ? leftLimit - groupLeft
    : groupRight > rightLimit
      ? rightLimit - groupRight
      : 0;

  if (Number.isFinite(shift)) {
    hero.style.setProperty("--lobby-title-group-shift", `${shift.toFixed(2)}px`);
  }
}

function resetSingleColumnTitleLift(hero) {
  hero?.querySelector(".lobby-title")?.style.removeProperty("--lobby-title-lift");
}

function resetSingleColumnTitleGroup(hero) {
  hero?.style.removeProperty("--lobby-title-group-shift");
}

function resetSingleColumnDescriptionPlacement(hero) {
  hero?.style.removeProperty("--lobby-description-separator-shift");
}

export function wireLobbyLayoutVariants() {
  const select = document.querySelector("#lobbyLayoutVariant");
  applyVariant(select, getSavedVariant());

  const screen = document.querySelector("#lobbyScreen");
  if (screen) {
    window.addEventListener("resize", scheduleLobbyContentCenter, { passive: true });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(scheduleLobbyContentCenter);
      // Observar solo referencias externas al ajuste. El grid, el hero, el
      // título y el boleto cambian de tamaño dentro de syncLobbyContentCenter;
      // observarlos vuelve a disparar el mismo cálculo mientras se redimensiona.
      [...screen.querySelectorAll(".lobby-marquee, .lobby-footer")]
        .forEach((element) => observer.observe(element));
    }
  }

  scheduleLobbyContentCenter();
  if (document.fonts?.ready) document.fonts.ready.then(scheduleLobbyContentCenter);

  if (!select) return;

  select.addEventListener("change", () => {
    applyVariant(select, select.value);
    saveVariant(select.value);
    scheduleLobbyContentCenter();
  });
}

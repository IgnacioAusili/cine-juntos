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

export function resetTitleFit(title) {
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

export function syncLobbyTitleFit(screen, hero, ticket) {
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

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const middle = (low + high) / 2;
    if (needsFitting(middle)) high = middle;
    else low = middle;
  }

  setTitleFitSize(title, low);
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

export function syncSingleColumnTitleLift(hero) {
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

export function syncSingleColumnTitleGroup(hero) {
  const title = hero?.querySelector(".lobby-title");
  const icon = hero?.querySelector(".lobby-title-icon");
  if (!hero || !title || !icon) return;

  hero.style.removeProperty("--lobby-title-group-shift");
  const heroRect = hero.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  const visible = getVisibleRect(title);
  const groupLeft = Math.min(titleRect.left, iconRect.left);
  const groupRight = Math.max(titleRect.right, iconRect.right);
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

export function resetSingleColumnTitleLift(hero) {
  hero?.querySelector(".lobby-title")?.style.removeProperty("--lobby-title-lift");
}

export function resetSingleColumnTitleGroup(hero) {
  hero?.style.removeProperty("--lobby-title-group-shift");
}

export function resetSingleColumnDescriptionPlacement(hero) {
  hero?.style.removeProperty("--lobby-description-separator-shift");
  hero?.querySelector(".lobby-description")?.style.removeProperty("--lobby-description-fit-width");
}

function getTextLineCount(element) {
  if (!element || element.getClientRects().length === 0) return 0;

  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  const height = element.getBoundingClientRect().height;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 0;
  return Math.max(1, Math.round(height / lineHeight));
}

function syncTextDensity(element, compactAtLines) {
  if (!element) return;

  // Medimos siempre el tamaño base para que el cambio no oscile al recalcular.
  element.removeAttribute("data-lobby-text-density");
  const lineCount = getTextLineCount(element);
  if (lineCount >= compactAtLines + 1) element.dataset.lobbyTextDensity = "dense";
  else if (lineCount >= compactAtLines) element.dataset.lobbyTextDensity = "compact";
}

export function syncLobbyTextDensity(hero, footer) {
  syncTextDensity(hero?.querySelector(".lobby-description"), 3);
  syncTextDensity(footer?.querySelector(".lobby-disclaimer"), 3);
}

export function syncLobbyTicketInlinePadding(ticket) {
  const body = ticket?.querySelector(".lobby-ticket-body");
  const stub = ticket?.querySelector(".lobby-ticket-stub");
  if (!body || !stub) return;

  ticket.style.removeProperty("--lobby-ticket-fit-padding-inline");
  const stubRect = stub.getBoundingClientRect();
  if (stubRect.width <= stubRect.height) return;

  const basePadding = Number.parseFloat(getComputedStyle(body).paddingInlineStart) || 0;
  const ticketWidth = ticket.getBoundingClientRect().width;
  const targetPadding = Math.min(basePadding, Math.max(10, Math.min(14, ticketWidth * 0.035)));
  if (targetPadding < basePadding) {
    ticket.style.setProperty("--lobby-ticket-fit-padding-inline", `${targetPadding.toFixed(2)}px`);
  }
}

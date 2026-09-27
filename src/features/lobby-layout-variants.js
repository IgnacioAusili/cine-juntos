import { resetLobbyTicketPlacement, syncLobbyTicketPlacement, syncLobbyTitlePlacement } from "./lobby-ticket-placement.js?v=20260922-lobby-ticket-track-center-03";

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
  const hasClippedFeatureHeading = featureHeadings.some((heading) => {
    if (heading.getClientRects().length === 0 || heading.clientWidth === 0) return false;

    const compactTitle = heading.querySelector(".lobby-feature-title-short");
    const compactTitleIsVisible = compactTitle?.getClientRects().length > 0;
    const isClipped = heading.scrollWidth > heading.clientWidth + 1;

    // El título largo ya se recorta de forma intencional y tiene una versión
    // corta para este espacio. Pasa a vertical cuando también se desborda la
    // versión corta que realmente ve el usuario.
    return isClipped && (!compactTitle || compactTitleIsVisible);
  });
  const isSingleColumn = Boolean(grid) && (
    gridColumns.length < 2 || (isColumns && hasClippedFeatureHeading)
  );
  document.body.dataset.lobbyFlow = isSingleColumn ? "single-column" : "columns";
  if (!isSingleColumn) resetLobbyAboutButtonContact();
  syncLobbyTitlePlacement(screen, isSingleColumn);

  if (!grid || content.length !== 2) {
    resetLobbyAboutButtonContact();
    resetTitleFit(screen?.querySelector(".lobby-title"));
    resetLobbyTicketPlacement(screen, ticket);
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    resetSingleColumnDescriptionPlacement(hero);
    syncLobbyTextDensity(hero, footer);
    syncLobbyTicketInlinePadding(ticket);
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
    syncSingleColumnDescriptionPlacement(hero, ticket);
    syncLobbyTextDensity(hero, footer);
    syncSingleColumnDescriptionPlacement(hero, ticket);
    syncLobbyTicketInlinePadding(ticket);
    syncSingleColumnContentGap(grid, ticket, footer);
    syncSingleColumnTicketPlacement(hero, ticket, footer);
    syncLobbyAboutButtonContact(ticket, footer);
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
  syncLobbyTicketInlinePadding(ticket);
  syncLobbyTextDensity(hero, footer);
  syncLobbyTitleFit(screen, hero, ticket);
  syncLobbyTitlePlacement(screen, false);

  const marqueeRect = marquee.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const contentRects = content.map((element) => element.getBoundingClientRect());
  const contentTop = Math.min(...contentRects.map((rect) => rect.top));
  const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));
  const availableCenter = (marqueeRect.bottom + footerRect.top) / 2;
  const contentCenter = (contentTop + contentBottom) / 2;
  const contentShift = availableCenter - contentCenter;

  if (Number.isFinite(contentShift)) {
    grid.style.setProperty("--lobby-content-center-shift", `${contentShift.toFixed(2)}px`);

    // El hero puede tener un levantamiento visual propio; por eso centrar el
    // grupo completo deja el boleto bajo su centro disponible. Alineamos el
    // boleto con el punto medio real entre marquesina y pie, sin usar medidas
    // fijas del viewport.
    const centeredTicketRect = ticket.getBoundingClientRect();
    const centeredTicketMiddle = (centeredTicketRect.top + centeredTicketRect.bottom) / 2;
    const ticketShift = availableCenter - centeredTicketMiddle;
    if (Number.isFinite(ticketShift)) {
      ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
    }
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

  const descriptionWidth = Math.max(hero.clientWidth, ticket.clientWidth);
  if (descriptionWidth > 0) {
    description.style.setProperty("--lobby-description-fit-width", `${descriptionWidth.toFixed(2)}px`);
  }

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

function resetLobbyAboutButtonContact() {
  delete document.body.dataset.lobbyAboutContact;
}

function syncLobbyAboutButtonContact(ticket, footer) {
  const button = footer?.querySelector(".lobby-about-button");
  if (!ticket || !button || button.getClientRects().length === 0) {
    resetLobbyAboutButtonContact();
    return;
  }

  const renderedScale = Number.parseFloat(getComputedStyle(button).scale);
  const scale = Number.isFinite(renderedScale) && renderedScale > 0 ? renderedScale : 1;
  const buttonRect = button.getBoundingClientRect();
  const centerX = (buttonRect.left + buttonRect.right) / 2;
  const centerY = (buttonRect.top + buttonRect.bottom) / 2;
  const unscaledWidth = buttonRect.width / scale;
  const unscaledHeight = buttonRect.height / scale;
  const baseButtonRect = {
    left: centerX - unscaledWidth / 2,
    right: centerX + unscaledWidth / 2,
    top: centerY - unscaledHeight / 2,
    bottom: centerY + unscaledHeight / 2,
  };
  const ticketRect = ticket.getBoundingClientRect();
  const contactTolerance = 1;
  const touchesButton = ticketRect.left <= baseButtonRect.right + contactTolerance
    && ticketRect.right >= baseButtonRect.left - contactTolerance
    && ticketRect.top <= baseButtonRect.bottom + contactTolerance
    && ticketRect.bottom >= baseButtonRect.top - contactTolerance;

  if (touchesButton) document.body.dataset.lobbyAboutContact = "true";
  else resetLobbyAboutButtonContact();
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

function syncSingleColumnTicketPlacement(hero, ticket, footer) {
  if (!hero || !ticket || !footer) return;

  const fitProperties = [
    "--lobby-ticket-fit-height",
    "--lobby-ticket-fit-stub-height",
    "--lobby-ticket-fit-padding-top",
    "--lobby-ticket-fit-padding-bottom",
    "--lobby-ticket-fit-body-gap",
    "--lobby-ticket-fit-head-padding",
    "--lobby-ticket-fit-fields-gap",
    "--lobby-ticket-fit-control-height",
    "--lobby-ticket-fit-action-height",
    "--lobby-ticket-fit-stub-inset",
  ];
  fitProperties.forEach((property) => ticket.style.removeProperty(property));

  const body = ticket.querySelector(".lobby-ticket-body");
  const stub = ticket.querySelector(".lobby-ticket-stub");
  const head = ticket.querySelector(".lobby-ticket-head");
  const fields = ticket.querySelector(".lobby-fields");
  const controls = [...(fields?.querySelectorAll('input[type="text"]') || [])];
  const actionButtons = [...ticket.querySelectorAll(".lobby-actions > .button")];
  const stubRect = stub?.getBoundingClientRect();
  const hasTopStub = Boolean(stubRect && stubRect.width > stubRect.height);
  if (body && hasTopStub) {
    const sidePadding = Number.parseFloat(getComputedStyle(body).paddingInlineStart);
    if (Number.isFinite(sidePadding)) {
      ticket.style.setProperty("--lobby-ticket-fit-padding-top", `${sidePadding.toFixed(2)}px`);
    }
  }
  const heroRect = hero.getBoundingClientRect();
  const baseTicketHeight = ticket.getBoundingClientRect().height;
  const footerRect = footer.getBoundingClientRect();
  const legalText = footer.querySelector(".lobby-disclaimer");
  const lowerVisibleBoundary = legalText?.getBoundingClientRect().top ?? footerRect.top;
  const availableHeight = Math.max(0, lowerVisibleBoundary - heroRect.bottom);
  const minimumGap = Math.min(9, availableHeight / 4);
  const targetTicketHeight = Math.min(
    baseTicketHeight,
    Math.max(0, availableHeight - minimumGap * 2),
  );
  let remainingCompression = Math.max(0, baseTicketHeight - targetTicketHeight);

  if (remainingCompression > 0) {
    // Primero reducimos el boleto completo (la franja naranja se acorta con él).
    ticket.style.setProperty("--lobby-ticket-fit-height", `${targetTicketHeight.toFixed(2)}px`);
    if (hasTopStub && stubRect) {
      const stubReduction = Math.min(6, remainingCompression * 0.18);
      ticket.style.setProperty(
        "--lobby-ticket-fit-stub-height",
        `${Math.max(28, stubRect.height - stubReduction).toFixed(2)}px`,
      );
      remainingCompression -= stubReduction;
    }
    const stubInset = Math.min(10, (baseTicketHeight - targetTicketHeight) / 2);
    if (stubInset > 0) {
      ticket.style.setProperty("--lobby-ticket-fit-stub-inset", `${stubInset.toFixed(2)}px`);
    }

    if (body && head && fields && controls.length) {
      const bodyStyle = getComputedStyle(body);
      const headStyle = getComputedStyle(head);
      const fieldsStyle = getComputedStyle(fields);
      const topPadding = Number.parseFloat(bodyStyle.paddingTop) || 0;
      const bottomPadding = Number.parseFloat(bodyStyle.paddingBottom) || 0;
      const bodyGap = Number.parseFloat(bodyStyle.rowGap) || 0;
      const headPadding = Number.parseFloat(headStyle.paddingBottom) || 0;
      const fieldsGap = Number.parseFloat(fieldsStyle.rowGap) || 0;
      const controlHeight = Number.parseFloat(getComputedStyle(controls[0]).height) || 0;
      const actionHeight = Number.parseFloat(getComputedStyle(actionButtons[0]).height) || 0;
      const fieldsGapCount = Math.max(0, fields.children.length - 1);

      // Después del alto exterior, quitamos relleno vertical y solo luego
      // reducimos separaciones y controles si todavía no alcanza.
      const topPaddingCapacity = Math.max(0, topPadding - Math.min(4, topPadding));
      const bottomPaddingCapacity = Math.max(0, bottomPadding - Math.min(4, bottomPadding));
      const paddingCapacity = (hasTopStub ? 0 : topPaddingCapacity) + bottomPaddingCapacity;
      const paddingReduction = Math.min(remainingCompression, paddingCapacity);
      if (paddingReduction > 0 && paddingCapacity > 0) {
        const effectiveTopPaddingCapacity = hasTopStub ? 0 : topPaddingCapacity;
        const topReduction = paddingReduction * (effectiveTopPaddingCapacity / paddingCapacity);
        const bottomReduction = paddingReduction - topReduction;
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-top",
          `${(topPadding - topReduction).toFixed(2)}px`,
        );
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-bottom",
          `${(bottomPadding - bottomReduction).toFixed(2)}px`,
        );
        remainingCompression -= paddingReduction;
      }

      const reduceRepeatedSpace = (property, base, minimum, count = 1) => {
        if (remainingCompression <= 0 || count <= 0) return;
        const perItemCapacity = Math.max(0, base - minimum);
        const perItemReduction = Math.min(perItemCapacity, remainingCompression / count);
        if (perItemReduction <= 0) return;
        ticket.style.setProperty(property, `${(base - perItemReduction).toFixed(2)}px`);
        remainingCompression -= perItemReduction * count;
      };

      reduceRepeatedSpace(
        "--lobby-ticket-fit-body-gap",
        bodyGap,
        Math.min(2, bodyGap),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-head-padding",
        headPadding,
        Math.min(0, headPadding),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-fields-gap",
        fieldsGap,
        Math.min(2, fieldsGap),
        fieldsGapCount,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-control-height",
        controlHeight,
        Math.min(28, controlHeight),
        controls.length,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-action-height",
        actionHeight,
        Math.min(34, actionHeight),
        actionButtons.length,
      );
    }
  }

  const ticketRect = ticket.getBoundingClientRect();
  const freeSpace = lowerVisibleBoundary - heroRect.bottom - ticketRect.height;
  const targetTicketTop = heroRect.bottom + Math.max(0, freeSpace / 2);

  const ticketShift = targetTicketTop - ticketRect.top;
  if (Number.isFinite(ticketShift)) {
    ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
  }
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

function resetSingleColumnTitleLift(hero) {
  hero?.querySelector(".lobby-title")?.style.removeProperty("--lobby-title-lift");
}

function resetSingleColumnTitleGroup(hero) {
  hero?.style.removeProperty("--lobby-title-group-shift");
}

function resetSingleColumnDescriptionPlacement(hero) {
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

function syncLobbyTextDensity(hero, footer) {
  syncTextDensity(hero?.querySelector(".lobby-description"), 3);
  syncTextDensity(footer?.querySelector(".lobby-disclaimer"), 3);
}

function syncLobbyTicketInlinePadding(ticket) {
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

function wireLobbyMarqueeEmojis(screen) {
  const track = screen?.querySelector(".lobby-marquee-track");
  const sets = [...(track?.querySelectorAll(".marquee-set") || [])];
  if (sets.length < 4) return;

  const emojiGroup = sets[0].querySelector(".marquee-emojis");
  const phrases = [...sets[0].querySelectorAll(".live, .marquee-fixed, .marquee-message")]
    .map((phrase) => ({ text: phrase.textContent, className: phrase.className }));
  const emojis = (emojiGroup?.dataset.emojis || "").split(",").filter(Boolean);
  if (phrases.length < 2 || emojis.length < 3) return;

  const shuffle = (items) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  };

  const phraseKey = (order) => order.map(({ className, text }) => `${className}:${text}`).join("\u001f");
  const emojiKey = (order) => order.join("\u001f");
  const currentPhraseOrder = (set) => [...set.querySelectorAll(".live, .marquee-fixed, .marquee-message")]
    .map((phrase) => ({ text: phrase.textContent, className: phrase.className }));
  const currentEmojiOrder = (set) => [...set.querySelectorAll(".marquee-emoji")]
    .map((emoji) => emoji.textContent);

  const chooseDifferentOrder = (items, count, keyFor, forbiddenKeys) => {
    const forbidden = new Set(forbiddenKeys);
    let candidate = [];
    for (let attempt = 0; attempt < 32; attempt += 1) {
      candidate = shuffle(items).slice(0, count);
      if (!forbidden.has(keyFor(candidate))) return candidate;
    }

    const base = shuffle(items);
    for (let offset = 1; offset < base.length; offset += 1) {
      candidate = [...base.slice(offset), ...base.slice(0, offset)].slice(0, count);
      if (!forbidden.has(keyFor(candidate))) return candidate;
    }
    return candidate;
  };

  const renderSet = (set, phraseOrder, emojiOrder) => {
    const phraseNodes = phraseOrder.map(({ text, className }) => {
      const item = document.createElement("span");
      item.className = className;
      item.textContent = text;
      return item;
    });
    const newEmojiGroup = document.createElement("span");
    newEmojiGroup.className = "marquee-emojis";
    newEmojiGroup.dataset.emojis = emojis.join(",");
    newEmojiGroup.setAttribute("aria-hidden", "true");
    newEmojiGroup.replaceChildren(...emojiOrder.map((emoji) => {
      const item = document.createElement("span");
      item.className = "marquee-emoji";
      item.textContent = emoji;
      return item;
    }));

    set.querySelector(".marquee-emojis")?.replaceWith(newEmojiGroup);
    [...set.querySelectorAll(".live, .marquee-fixed, .marquee-message")].forEach((node) => node.remove());
    set.prepend(...phraseNodes);
    phraseNodes.at(-1)?.after(newEmojiGroup);
  };

  const initialPhraseOrder = shuffle(phrases);
  const initialEmojiOrder = shuffle(emojis);
  sets.forEach((set, setIndex) => {
    const phraseOrder = initialPhraseOrder.map((_, index) => initialPhraseOrder[(index + setIndex) % initialPhraseOrder.length]);
    const emojiOrder = Array.from({ length: 3 }, (_, index) => initialEmojiOrder[(setIndex + index) % initialEmojiOrder.length]);
    renderSet(set, phraseOrder, emojiOrder);
  });

  track.addEventListener("animationiteration", () => {
    const currentSets = [...track.querySelectorAll(".marquee-set")];
    const outgoingSets = currentSets.slice(0, 2);
    const nextBatch = currentSets.slice(2);
    const forbiddenPhraseOrders = nextBatch.map((set) => phraseKey(currentPhraseOrder(set)));
    const forbiddenEmojiOrders = nextBatch.map((set) => emojiKey(currentEmojiOrder(set)));

    outgoingSets.forEach((set) => {
      forbiddenPhraseOrders.push(phraseKey(currentPhraseOrder(set)));
      const nextPhraseOrder = chooseDifferentOrder(phrases, phrases.length, phraseKey, forbiddenPhraseOrders);
      forbiddenPhraseOrders.push(phraseKey(nextPhraseOrder));

      forbiddenEmojiOrders.push(emojiKey(currentEmojiOrder(set)));
      const nextEmojiOrder = chooseDifferentOrder(emojis, 3, emojiKey, forbiddenEmojiOrders);
      forbiddenEmojiOrders.push(emojiKey(nextEmojiOrder));

      renderSet(set, nextPhraseOrder, nextEmojiOrder);
      track.append(set);
    });
  });
}

export function wireLobbyLayoutVariants() {
  const select = document.querySelector("#lobbyLayoutVariant");
  applyVariant(select, getSavedVariant());

  const screen = document.querySelector("#lobbyScreen");
  if (screen) {
    wireLobbyMarqueeEmojis(screen);
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

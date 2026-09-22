const TITLE_ICON_SCALE = 1.085;
const TITLE_ICON_MIN_SIZE_PX = 56;
const TITLE_ICON_MAX_SIZE_PX = 160;

function syncLobbyTitleIconSize(title, icon) {
  const fontSize = Number.parseFloat(getComputedStyle(title).fontSize);
  if (!Number.isFinite(fontSize)) return;

  const size = Math.min(
    TITLE_ICON_MAX_SIZE_PX,
    Math.max(TITLE_ICON_MIN_SIZE_PX, fontSize * TITLE_ICON_SCALE),
  );
  const sizeValue = `${size.toFixed(2)}px`;
  icon.style.setProperty("width", sizeValue);
  icon.style.setProperty("height", sizeValue);
}

function getTitleVisualRect(title) {
  const lines = [...title.querySelectorAll(".lobby-title-line")];
  const rects = lines.map((line) => line.getBoundingClientRect());
  if (!rects.length) return title.getBoundingClientRect();

  const bounds = rects.reduce((current, rect) => ({
    left: Math.min(current.left, rect.left),
    top: Math.min(current.top, rect.top),
    right: Math.max(current.right, rect.right),
    bottom: Math.max(current.bottom, rect.bottom),
  }), {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export function resetLobbyTicketPlacement(screen, ticket) {
  document.body.removeAttribute("data-lobby-ticket-stub");
  ticket?.style.removeProperty("translate");
  screen?.style.removeProperty("--lobby-ticket-right-shift");
}

export function syncLobbyTicketPlacement(screen, ticket) {
  if (!screen || !ticket) return;

  const grid = screen.querySelector(".lobby-grid");
  if (!grid) return;

  // El grid ya centra el boleto en su segunda pista. Quitar cualquier
  // desplazamiento antiguo evita que el boleto quede corrido al redimensionar.
  ticket.style.removeProperty("translate");

  const columns = getComputedStyle(grid).gridTemplateColumns
    .trim()
    .split(/\s+/)
    .map((track) => Number.parseFloat(track));
  const ticketTrackWidth = columns[1];
  if (!Number.isFinite(ticketTrackWidth)) return;

  // El modo horizontal reduce el ancho del boleto. Si el umbral se calcula
  // sobre el modo actualmente aplicado, el boleto entra y sale del umbral en
  // cada ciclo de ResizeObserver y parpadea entre ambas disposiciones.
  // Medir siempre el estado lateral hace que la decisión sea estable.
  document.body.removeAttribute("data-lobby-ticket-stub");
  const sideTicketRect = ticket.getBoundingClientRect();
  const sideNeedsTopStub = sideTicketRect.width > ticketTrackWidth;
  const stubMode = sideNeedsTopStub ? "top" : "side";
  document.body.dataset.lobbyTicketStub = stubMode;
}

export function syncLobbyTitlePlacement(screen, isSingleColumn) {
  const hero = screen?.querySelector(".lobby-hero");
  const title = hero?.querySelector(".lobby-title");
  const icon = hero?.querySelector(".lobby-title-icon");
  if (!hero) return;

  // El título tiene dos líneas independientes; el ícono debe tomar como
  // referencia la caja combinada de ambas y no solo la primera línea.
  icon?.style.removeProperty("transform");
  if (!title || !icon) {
    delete hero.dataset.titlePlacement;
    icon?.style.removeProperty("position");
    icon?.style.removeProperty("left");
    icon?.style.removeProperty("top");
    return;
  }

  syncLobbyTitleIconSize(title, icon);

  if (!isSingleColumn) {
    delete hero.dataset.titlePlacement;
    icon.style.removeProperty("position");
    icon.style.removeProperty("left");
    icon.style.removeProperty("top");
  }

  const titleRect = getTitleVisualRect(title);
  const baseTransform = getComputedStyle(icon).transform;
  const iconRect = icon.getBoundingClientRect();

  if (!isSingleColumn) {
    const titleCenter = (titleRect.top + titleRect.bottom) / 2;
    const iconCenter = (iconRect.top + iconRect.bottom) / 2;
    const verticalShift = titleCenter - iconCenter;
    if (Number.isFinite(verticalShift) && Math.abs(verticalShift) > 0.01) {
      const transformPrefix = baseTransform === "none" ? "" : `${baseTransform} `;
      icon.style.setProperty("transform", `${transformPrefix}translateY(${verticalShift.toFixed(2)}px)`);
    }
    return;
  }

  hero.dataset.titlePlacement = "centered";
  icon.style.removeProperty("left");
  icon.style.removeProperty("top");
  const heroRect = hero.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(hero).columnGap) || 14;
  icon.style.setProperty("left", `${titleRect.left - heroRect.left - iconRect.width - gap}px`);
  icon.style.setProperty("top", `${titleRect.top - heroRect.top + (titleRect.height - iconRect.height) / 2}px`);
}

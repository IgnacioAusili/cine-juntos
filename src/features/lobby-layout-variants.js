import { resetLobbyTicketPlacement, syncLobbyTicketPlacement } from "./lobby-ticket-placement.js?v=20260918-lobby-ticket-placement-02";

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
  const ticketRect = ticket?.getBoundingClientRect();
  const rightLimit = ticketRect
    ? Math.min(heroRect.right, ticketRect.left - TITLE_FIT_GAP_PX) - TITLE_FIT_SAFE_SPACE_PX
    : heroRect.right - TITLE_FIT_SAFE_SPACE_PX;

  return visualRect.left < Math.max(visibleRect.left, heroRect.left) - 1
    || visualRect.top < visibleRect.top - 1
    || visualRect.right > Math.min(visibleRect.right, rightLimit)
    || visualRect.bottom > visibleRect.bottom + 1;
}

function setTitleFitSize(title, size) {
  title.style.setProperty("--lobby-title-size", `${size}px`);
  title.style.setProperty("font-size", `${size}px`);
}

function resetTitleFit(title) {
  title?.style.removeProperty("--lobby-title-size");
  title?.style.removeProperty("font-size");
}

function syncLobbyTitleFit(screen, hero, ticket) {
  const title = screen.querySelector(".lobby-title");
  if (!title) return;

  resetTitleFit(title);
  const baseSize = Number.parseFloat(getComputedStyle(title).fontSize);
  if (!Number.isFinite(baseSize) || !titleNeedsFitting(title, hero, ticket)) return;

  let low = Math.max(TITLE_FIT_MIN_SIZE_PX, baseSize * TITLE_FIT_MIN_SCALE);
  let high = baseSize;
  setTitleFitSize(title, low);

  if (titleNeedsFitting(title, hero, ticket)) return;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const middle = (low + high) / 2;
    setTitleFitSize(title, middle);
    if (titleNeedsFitting(title, hero, ticket)) high = middle;
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
  const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/) : [];
  const isSingleColumn = gridColumns.length < 2;

  if (!isColumns || isSingleColumn || !marquee || !footer || !grid || content.length !== 2) {
    resetTitleFit(screen?.querySelector(".lobby-title")); resetLobbyTicketPlacement(screen, screen?.querySelector(".lobby-ticket"));
    grid?.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // Medimos siempre desde la posición base para no acumular el desplazamiento
  // anterior al cambiar de viewport o al cambiar la variante.
  grid.style.setProperty("--lobby-content-center-shift", "0px");
  syncLobbyTicketPlacement(screen, screen.querySelector(".lobby-ticket")); syncLobbyTitleFit(screen, screen.querySelector(".lobby-hero"), screen.querySelector(".lobby-ticket"));

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

export function wireLobbyLayoutVariants() {
  const select = document.querySelector("#lobbyLayoutVariant");
  applyVariant(select, getSavedVariant());

  const screen = document.querySelector("#lobbyScreen");
  if (screen) {
    window.addEventListener("resize", scheduleLobbyContentCenter, { passive: true });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(scheduleLobbyContentCenter);
      [screen, ...screen.querySelectorAll(".lobby-marquee, .lobby-footer, .lobby-grid, .lobby-hero, .lobby-ticket, .lobby-title")]
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

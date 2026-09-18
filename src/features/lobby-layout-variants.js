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

  if (!isColumns || window.innerWidth < 861 || !marquee || !footer || !grid || content.length !== 2) {
    grid?.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // Medimos siempre desde la posición base para no acumular el desplazamiento
  // anterior al cambiar de viewport o al cambiar la variante.
  grid.style.setProperty("--lobby-content-center-shift", "0px");

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
      [screen, ...screen.querySelectorAll(".lobby-marquee, .lobby-footer, .lobby-grid, .lobby-hero, .lobby-ticket")]
        .forEach((element) => observer.observe(element));
    }
  }

  scheduleLobbyContentCenter();

  if (!select) return;

  select.addEventListener("change", () => {
    applyVariant(select, select.value);
    saveVariant(select.value);
    scheduleLobbyContentCenter();
  });
}

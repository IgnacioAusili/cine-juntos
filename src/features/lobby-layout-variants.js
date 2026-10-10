import { scheduleLobbyContentCenter } from "./lobby-content-layout.js?v=20261010-file-size-refactor-02";
import { wireLobbyMarqueeContent } from "./lobby-marquee.js?v=20261010-file-size-refactor-02";

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

export function wireLobbyLayoutVariants() {
  const select = document.querySelector("#lobbyLayoutVariant");
  applyVariant(select, getSavedVariant());

  const screen = document.querySelector("#lobbyScreen");
  if (screen) {
    wireLobbyMarqueeContent(screen);
    window.addEventListener("resize", scheduleLobbyContentCenter, { passive: true });

    if (typeof MutationObserver === "function") {
      let wasLobbyVisible = document.body.classList.contains("is-lobby");
      const visibilityObserver = new MutationObserver(() => {
        const isLobbyVisible = document.body.classList.contains("is-lobby");
        if (isLobbyVisible && !wasLobbyVisible) scheduleLobbyContentCenter();
        wasLobbyVisible = isLobbyVisible;
      });
      visibilityObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

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

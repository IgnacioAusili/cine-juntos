const MOBILE_WIDTH_QUERY = "(max-width: 980px)";

let orientationLocked = false;

function isMobileLayout() {
  return window.matchMedia(MOBILE_WIDTH_QUERY).matches;
}

function isFullscreenActive() {
  return Boolean(document.fullscreenElement)
    || document.body.classList.contains("fullscreen-mode");
}

async function syncFullscreenOrientation() {
  if (!isFullscreenActive() || !isMobileLayout()) {
    if (orientationLocked && typeof screen.orientation?.unlock === "function") {
      screen.orientation.unlock();
    }
    orientationLocked = false;
    return;
  }

  if (typeof screen.orientation?.lock !== "function") return;

  try {
    await screen.orientation.lock("landscape");
    orientationLocked = true;
  } catch {
    // iOS Safari y algunos navegadores no permiten bloquear orientacion desde
    // una pagina; el layout responsive sigue siendo util en ese caso.
  }
}

export function wireMobileFullscreenOrientation() {
  document.addEventListener("fullscreenchange", syncFullscreenOrientation);

  const bodyObserver = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "class")) {
      void syncFullscreenOrientation();
    }
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

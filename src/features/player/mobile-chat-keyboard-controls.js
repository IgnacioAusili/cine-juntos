import { dom } from "../../core/dom.js";

const isRightLandscapeChatKeyboardOpen = () => Boolean(
  document.documentElement.classList.contains("viewport-landscape")
  && document.documentElement.classList.contains("right-chat-keyboard-open")
  && dom.sessionView?.dataset.chatDock === "right"
  && !dom.sessionView?.hidden,
);
let visibilitySyncFrame = 0;
let visibilitySyncTimer = 0;

function syncPlayerControlsVisibility() {
  const keyboardOpen = isRightLandscapeChatKeyboardOpen();
  dom.playerFrame?.classList.toggle("player-controls-keyboard-hidden", keyboardOpen);
  if (keyboardOpen) dom.playerFrame?.classList.remove("player-cursor-hidden");
}

export function wireMobileChatKeyboardControls() {
  if (!dom.playerFrame || !dom.sessionView) return;

  const scheduleVisibilitySync = () => {
    if (visibilitySyncFrame || visibilitySyncTimer) return;
    const applyVisibilitySync = () => {
      if (visibilitySyncFrame) window.cancelAnimationFrame(visibilitySyncFrame);
      visibilitySyncFrame = 0;
      if (visibilitySyncTimer) window.clearTimeout(visibilitySyncTimer);
      visibilitySyncTimer = 0;
      syncPlayerControlsVisibility();
    };
    visibilitySyncFrame = window.requestAnimationFrame(applyVisibilitySync);
    // Durante algunos reflows del IME el frame puede quedar postergado. El
    // respaldo conserva el cambio y deja que la transicion CSS haga su trabajo.
    visibilitySyncTimer = window.setTimeout(applyVisibilitySync, 34);
  };

  scheduleVisibilitySync();

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "class")) {
      // El root cambia al comenzar el resize del viewport. Esperar un frame
      // permite que la barra pinte su estado visible antes de desvanecerse.
      scheduleVisibilitySync();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  const revealControlsFromVideo = (event) => {
    if (
      !dom.playerFrame.classList.contains("player-controls-keyboard-hidden")
      || (event.pointerType && event.pointerType !== "touch" && event.pointerType !== "pen")
    ) return;

    // Quitar tambien el estado visible antes del pointerup permite que la
    // logica normal del player trate este toque como una revelacion.
    dom.playerFrame.classList.remove(
      "player-controls-keyboard-hidden",
      "player-overlay-visible",
      "player-cursor-hidden",
    );
  };
  dom.videoPlayer?.addEventListener("pointerdown", revealControlsFromVideo, {
    capture: true,
    passive: true,
  });
}

import { dom } from "../../core/dom.js";

const isRightChatKeyboardOpen = () => Boolean(
  document.documentElement.classList.contains('page-context--right-chat-keyboard-open')
  && dom.sessionView?.dataset.chatDock === "right"
  && !dom.sessionView?.hidden,
);
const isMobileChatKeyboardOpen = () => Boolean(
  dom.sessionView
  && !dom.sessionView.hidden
  && (
    (document.documentElement.classList.contains('page-context--bottom-chat-keyboard-open')
      && dom.sessionView.dataset.chatDock === "bottom")
    || isRightChatKeyboardOpen()
  )
);
let visibilitySyncFrame = 0;
let visibilitySyncTimer = 0;
let wasMobileChatKeyboardOpen = false;
let controlsVisibleBeforeKeyboard = null;
let cursorHiddenBeforeKeyboard = null;

function syncPlayerControlsVisibility() {
  const keyboardOpen = isMobileChatKeyboardOpen();
  const keyboardJustOpened = keyboardOpen && !wasMobileChatKeyboardOpen;
  const keyboardJustClosed = wasMobileChatKeyboardOpen && !keyboardOpen;
  if (keyboardJustOpened) {
    controlsVisibleBeforeKeyboard = dom.playerFrame?.classList.contains('player-frame--overlay-visible');
    cursorHiddenBeforeKeyboard = dom.playerFrame?.classList.contains('player-frame--cursor-hidden');
  }
  dom.playerFrame?.classList.toggle('player-controls-bar--keyboard-hidden', keyboardOpen);
  if (keyboardOpen) dom.playerFrame?.classList.remove('player-frame--cursor-hidden');
  if (keyboardJustClosed) {
    if (controlsVisibleBeforeKeyboard === true) {
      dom.playerFrame?.classList.add('player-frame--overlay-visible');
    } else if (controlsVisibleBeforeKeyboard === false) {
      dom.playerFrame?.classList.remove('player-frame--overlay-visible');
    }
    if (cursorHiddenBeforeKeyboard === true) {
      dom.playerFrame?.classList.add('player-frame--cursor-hidden');
    } else if (cursorHiddenBeforeKeyboard === false) {
      dom.playerFrame?.classList.remove('player-frame--cursor-hidden');
    }
    controlsVisibleBeforeKeyboard = null;
    cursorHiddenBeforeKeyboard = null;
  }
  wasMobileChatKeyboardOpen = keyboardOpen;
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
      !dom.playerFrame.classList.contains('player-controls-bar--keyboard-hidden')
      || (event.pointerType && event.pointerType !== "touch" && event.pointerType !== "pen")
    ) return;

    if (isMobileChatKeyboardOpen()) return;

    // Quitar tambien el estado visible antes del pointerup permite que la
    // logica normal del player trate este toque como una revelacion.
    dom.playerFrame.classList.remove(
      'player-controls-bar--keyboard-hidden',
      'player-frame--overlay-visible',
      'player-frame--cursor-hidden',
    );
  };
  dom.videoPlayer?.addEventListener("pointerdown", revealControlsFromVideo, {
    capture: true,
    passive: true,
  });
}

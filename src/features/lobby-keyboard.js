const LOBBY_INPUT_SELECTOR = "#lobbyNameInput, #roomInput";
const KEYBOARD_DELTA_PX = 80;

let restoreScrollTop = 0;
let baselineViewportHeight = 0;
let keyboardOpen = false;
let restoreTimer = 0;

function isLobbyInput(target) {
  return target instanceof HTMLInputElement
    && target.matches(LOBBY_INPUT_SELECTOR)
    && document.body.classList.contains("is-lobby");
}

function getViewportHeight() {
  return window.visualViewport?.height || window.innerHeight || 0;
}

function restoreLobbyScroll() {
  window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    if (!document.body.classList.contains("is-lobby")) return;

    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    window.scrollTo({
      top: Math.min(restoreScrollTop, maxScroll),
      behavior: "auto",
    });

    // Chrome puede aplicar un segundo ajuste después del primer resize.
    restoreTimer = window.setTimeout(() => {
      window.scrollTo({
        top: Math.min(restoreScrollTop, Math.max(
          0,
          document.documentElement.scrollHeight - document.documentElement.clientHeight,
        )),
        behavior: "auto",
      });
    }, 80);
  }, 0);
}

function syncKeyboardViewport() {
  if (!document.body.classList.contains("is-lobby")) return;

  const viewportHeight = getViewportHeight();
  if (!viewportHeight || !baselineViewportHeight) return;

  const reduced = baselineViewportHeight - viewportHeight > KEYBOARD_DELTA_PX;
  if (reduced) {
    keyboardOpen = true;
    return;
  }

  if (!keyboardOpen) return;
  keyboardOpen = false;
  restoreLobbyScroll();
}

export function wireLobbyKeyboardRestore() {
  document.addEventListener("focusin", (event) => {
    if (!isLobbyInput(event.target)) return;
    restoreScrollTop = window.scrollY || 0;
    baselineViewportHeight = getViewportHeight();
    keyboardOpen = false;
  }, { passive: true });

  document.addEventListener("focusout", (event) => {
    if (isLobbyInput(document.activeElement) || isLobbyInput(event.relatedTarget)) return;
    window.clearTimeout(restoreTimer);
    keyboardOpen = false;
    baselineViewportHeight = 0;
  }, { passive: true });

  window.addEventListener("resize", syncKeyboardViewport, { passive: true });
  window.visualViewport?.addEventListener(
    "resize",
    syncKeyboardViewport,
    { passive: true },
  );
}

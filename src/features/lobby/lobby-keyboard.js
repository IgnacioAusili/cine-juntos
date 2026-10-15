import { scheduleLobbyContentCenter } from "./lobby-content-layout.js";

const LOBBY_INPUT_SELECTOR = "#lobbyNameInput, #roomInput";
const KEYBOARD_DELTA_PX = 80;
const KEYBOARD_GAP_PX = 8;

let restoreScrollTop = 0;
let baselineViewportHeight = 0;
let activeLobbyInput = null;
let keyboardOpen = false;
let restoreTimer = 0;
let alignFrame = 0;

function isLobbyInput(target) {
  return target instanceof HTMLInputElement
    && target.matches(LOBBY_INPUT_SELECTOR)
    && document.body.classList.contains("page-context--lobby");
}

function getViewportHeight() {
  return window.visualViewport?.height || window.innerHeight || 0;
}

function setKeyboardLayoutActive(active) {
  if (active) document.body.dataset.lobbyKeyboardOpen = "true";
  else delete document.body.dataset.lobbyKeyboardOpen;
  document.body.style.removeProperty("--lobby-keyboard-scroll-space");
  scheduleLobbyContentCenter();
}

function restoreLobbyScroll() {
  window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(() => {
    if (!document.body.classList.contains("page-context--lobby")) return;

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

function alignLobbyInputWithKeyboard() {
  alignFrame = 0;
  if (!keyboardOpen || !activeLobbyInput?.isConnected) return;

  const viewport = window.visualViewport;
  const visibleBottom = (viewport?.offsetTop || 0) + getViewportHeight();
  const inputBottom = activeLobbyInput.getBoundingClientRect().bottom;
  const scrollDelta = inputBottom - visibleBottom + KEYBOARD_GAP_PX;
  if (!Number.isFinite(scrollDelta) || Math.abs(scrollDelta) <= 1) return;

  const targetScroll = Math.max(0, window.scrollY + scrollDelta);
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  const neededScrollSpace = Math.max(0, targetScroll - maxScroll);
  const currentScrollSpace = Number.parseFloat(
    document.body.style.getPropertyValue("--lobby-keyboard-scroll-space"),
  ) || 0;

  if (neededScrollSpace > currentScrollSpace + 1) {
    document.body.style.setProperty(
      "--lobby-keyboard-scroll-space",
      `${neededScrollSpace.toFixed(2)}px`,
    );
    scheduleInputAlignment();
    return;
  }

  window.scrollTo({ top: targetScroll, behavior: "auto" });
}

function scheduleInputAlignment() {
  if (alignFrame || !keyboardOpen || !activeLobbyInput) return;
  alignFrame = window.requestAnimationFrame(alignLobbyInputWithKeyboard);
}

function syncKeyboardViewport() {
  if (!document.body.classList.contains("page-context--lobby")) {
    if (keyboardOpen) {
      keyboardOpen = false;
      activeLobbyInput = null;
      document.body.removeAttribute("data-lobby-input-focused");
      setKeyboardLayoutActive(false);
    }
    return;
  }

  const viewportHeight = getViewportHeight();
  if (!viewportHeight || !baselineViewportHeight) return;

  const reduced = baselineViewportHeight - viewportHeight > KEYBOARD_DELTA_PX;
  if (reduced) {
    if (!keyboardOpen) {
      keyboardOpen = true;
      setKeyboardLayoutActive(true);
    }
    scheduleInputAlignment();
    return;
  }

  if (!keyboardOpen) return;
  keyboardOpen = false;
  document.body.removeAttribute("data-lobby-input-focused");
  setKeyboardLayoutActive(false);
  if (!activeLobbyInput) baselineViewportHeight = 0;
  restoreLobbyScroll();
}

export function wireLobbyKeyboardRestore() {
  document.addEventListener("focusin", (event) => {
    if (!isLobbyInput(event.target)) return;

    window.clearTimeout(restoreTimer);
    if (!activeLobbyInput) restoreScrollTop = window.scrollY || 0;
    activeLobbyInput = event.target;
    document.body.dataset.lobbyInputFocused = "true";
    if (!keyboardOpen) baselineViewportHeight = getViewportHeight();
    scheduleLobbyContentCenter();
    scheduleInputAlignment();
  }, { passive: true });

  document.addEventListener("focusout", (event) => {
    if (isLobbyInput(document.activeElement) || isLobbyInput(event.relatedTarget)) return;

    activeLobbyInput = null;
    document.body.removeAttribute("data-lobby-input-focused");
    window.clearTimeout(restoreTimer);
    if (!keyboardOpen) {
      baselineViewportHeight = 0;
      document.body.removeAttribute("data-lobby-keyboard-open");
      document.body.style.removeProperty("--lobby-keyboard-scroll-space");
      scheduleLobbyContentCenter();
    }
  }, { passive: true });

  window.addEventListener("resize", syncKeyboardViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", syncKeyboardViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleInputAlignment, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleInputAlignment, { passive: true });
  window.addEventListener("scroll", scheduleInputAlignment, { passive: true });
}

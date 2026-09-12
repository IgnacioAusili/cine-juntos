import { dom } from "../core/dom.js";
import { logEvent } from "../core/state.js?v=20260912-name-session-01";
import { collectMobileKeyboardSnapshot } from "./mobile-keyboard-diagnostics-snapshot.js?v=20260911-ios-landscape-keyboard-diagnostics-01";

const LOG_KIND = "mobile-keyboard-debug";
const VIEWPORT_EVENT_DELAY_MS = 80;
const FINAL_EVENT_DELAY_MS = 360;
const SCROLL_LOG_INTERVAL_MS = 160;
let sequence = 0;
let viewportTimer = 0;
let lastScrollLogAt = 0;
let lastRootClass = "";
let lastSessionState = "";

function writeSnapshot(reason) {
  sequence += 1;
  logEvent(LOG_KIND, JSON.stringify(collectMobileKeyboardSnapshot(reason, sequence)));
}

function scheduleSnapshot(reason) {
  writeSnapshot(reason);
  window.requestAnimationFrame(() => writeSnapshot(`${reason}:raf`));
  window.setTimeout(() => writeSnapshot(`${reason}:settled`), FINAL_EVENT_DELAY_MS);
}

function handleScroll() {
  const activeInput = document.activeElement;
  if (![dom.messageInput, dom.overlayMessageInput].includes(activeInput)) return;
  const now = performance.now();
  if (now - lastScrollLogAt < SCROLL_LOG_INTERVAL_MS) return;
  lastScrollLogAt = now;
  writeSnapshot("scroll:while-input-focused");
}

function handleViewportEvent(reason) {
  window.clearTimeout(viewportTimer);
  viewportTimer = window.setTimeout(() => scheduleSnapshot(reason), VIEWPORT_EVENT_DELAY_MS);
}

export function wireMobileKeyboardDiagnostics() {
  if (!dom.sessionView || !dom.messageInput) return;

  writeSnapshot("init");
  [dom.messageInput, dom.overlayMessageInput].filter(Boolean).forEach((input) => {
    ["pointerdown", "touchstart", "focus", "blur", "keyup"].forEach((eventName) => {
      input.addEventListener(eventName, () => scheduleSnapshot(`${input.id}:${eventName}`), { passive: true });
    });
  });

  window.addEventListener("resize", () => handleViewportEvent("window:resize"), { passive: true });
  window.addEventListener("orientationchange", () => scheduleSnapshot("window:orientationchange"), { passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
  window.addEventListener("pageshow", () => scheduleSnapshot("window:pageshow"), { passive: true });
  document.addEventListener("visibilitychange", () => scheduleSnapshot(`document:visibility-${document.visibilityState}`), { passive: true });
  window.visualViewport?.addEventListener("resize", () => handleViewportEvent("visualViewport:resize"), { passive: true });
  window.visualViewport?.addEventListener("scroll", () => handleViewportEvent("visualViewport:scroll"), { passive: true });
  navigator.virtualKeyboard?.addEventListener?.("geometrychange", () => scheduleSnapshot("virtualKeyboard:geometrychange"), { passive: true });

  const observer = new MutationObserver(() => {
    const rootClass = document.documentElement.className;
    const sessionState = `${dom.sessionView.className}|${dom.sessionView.dataset.chatDock || ""}`;
    if (rootClass === lastRootClass && sessionState === lastSessionState) return;
    lastRootClass = rootClass;
    lastSessionState = sessionState;
    scheduleSnapshot("mutation:layout-state");
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  observer.observe(dom.sessionView, { attributes: true, attributeFilter: ["class", "data-chat-dock"] });
}

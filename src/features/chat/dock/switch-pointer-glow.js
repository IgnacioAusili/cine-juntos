const SWITCH_SELECTOR = ".chat-auto-switch";

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") return;
  const toggle = event.target.closest?.(SWITCH_SELECTOR);
  if (toggle) toggle.dataset.pointerGlow = "true";
}, true);

document.addEventListener("pointerleave", (event) => {
  if (event.target instanceof Element && event.target.matches(SWITCH_SELECTOR)) {
    event.target.removeAttribute("data-pointer-glow");
  }
}, true);

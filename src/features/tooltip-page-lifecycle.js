import { hideTooltip } from "./icons-tooltips.js?v=20260914-tooltip-single-path-01";

let suppressRestoredFocusTooltip = false;

function handlePageLeave() {
  suppressRestoredFocusTooltip = true;
  hideTooltip(true);
}

function resumeFocusTooltips() {
  suppressRestoredFocusTooltip = false;
}

window.addEventListener("blur", handlePageLeave);
window.addEventListener("pagehide", handlePageLeave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) handlePageLeave();
});

// Algunos navegadores restauran el foco DOM al volver a la pestaña y emiten
// focusin otra vez, aunque el usuario no haya enfocado el elemento de nuevo.
// Se deja continuar el evento para que la app actualice el foco, pero se
// cancela el tooltip antes del siguiente frame.
document.addEventListener("focusin", () => {
  if (!suppressRestoredFocusTooltip || document.hidden) return;
  queueMicrotask(() => {
    if (suppressRestoredFocusTooltip) hideTooltip(true);
  });
}, true);

document.addEventListener("keydown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);
document.addEventListener("pointerdown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);

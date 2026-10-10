import { hideTooltip } from "./icons-tooltips.js?v=20261010-file-size-refactor-02";

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
// focusin aunque el usuario no haya enfocado el elemento de nuevo. Se marca
// el evento para que el manejador central no abra un tooltip por ese foco.
document.addEventListener("focusin", (event) => {
  if (!suppressRestoredFocusTooltip || document.hidden) return;
  event.__skipTooltipForRestoredFocus = true;
}, true);

document.addEventListener("keydown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);
document.addEventListener("pointerdown", (event) => {
  if (event.isTrusted) resumeFocusTooltips();
}, true);

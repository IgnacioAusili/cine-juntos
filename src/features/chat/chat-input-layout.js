import { dom } from "../../core/dom.js";
import { autoResizeMessageInput } from "./chat-input.js?v=20261009-auto-expand-tooltip-01";

function observeComposerWidth(input) {
  const shell = input?.closest(".textarea-shell");
  if (!input || !shell || input.dataset.composerWidthObserverBound === "true") return;
  input.dataset.composerWidthObserverBound = "true";

  const resize = () => autoResizeMessageInput(input);
  if (typeof ResizeObserver !== "function") {
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("chat-layout-settled", resize, { passive: true });
    return;
  }

  let previousWidth = shell.getBoundingClientRect().width;
  let resizeTimer = 0;
  const observer = new ResizeObserver(([entry]) => {
    const nextWidth = entry?.contentRect?.width;
    if (!Number.isFinite(nextWidth) || Math.abs(nextWidth - previousWidth) < 0.5) return;

    previousWidth = nextWidth;
    window.clearTimeout(resizeTimer);
    // El ancho puede animarse durante el cambio de dock. Medir al final evita
    // dejar la altura calculada para la superficie anterior.
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
    }, 60);
  });
  observer.observe(shell);
}

[dom.messageInput, dom.overlayMessageInput].forEach(observeComposerWidth);

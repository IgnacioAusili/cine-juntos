import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { getVideoAreaRect, isStackedSessionLayout } from "./chat-responsive-layout.js?v=20261011-chat-ui-fixes-02";
import { CHAT_LAYOUT_SETTLE_MS } from "./chat-layout-timing.js?v=20261010-file-size-refactor-02";
let externalChatVisualMotionTimer = 0;

export function animateExternalChatLayoutFrom(previousRect) {
  if (!dom.sessionView || !dom.videoArea || !previousRect) return;

  if (
    isStackedSessionLayout()
    && (dom.sessionView.dataset.chatDock || "right") === "bottom"
  ) {
    return;
  }

  // El dock lateral copia la cortina del prototipo: se anima el ancho del
  // panel, sin aplicar escala al area del video ni modificar su alto.
  if ((dom.sessionView.dataset.chatDock || "right") === "right") return;

  if (externalChatVisualMotionTimer) {
    window.clearTimeout(externalChatVisualMotionTimer);
    externalChatVisualMotionTimer = 0;
  }
  dom.sessionView.classList.remove("chat-layout-visual-motion");
  dom.sessionView.style.removeProperty("--chat-layout-video-scale-x");
  dom.sessionView.style.removeProperty("--chat-layout-video-scale-y");

  const nextRect = getVideoAreaRect();
  if (!nextRect) return;
  const scaleX = previousRect.width / nextRect.width;
  const scaleY = previousRect.height / nextRect.height;
  if (Math.abs(1 - scaleX) < 0.01 && Math.abs(1 - scaleY) < 0.01) return;

  dom.sessionView.style.setProperty("--chat-layout-video-scale-x", String(scaleX));
  dom.sessionView.style.setProperty("--chat-layout-video-scale-y", String(scaleY));
  dom.sessionView.classList.add("chat-layout-visual-motion");
  // Confirma el estado inicial antes del siguiente frame; sin esta lectura el
  // navegador puede agrupar ambos valores y convertir la transición en salto.
  void dom.videoArea.offsetWidth;

  window.requestAnimationFrame(() => {
    if (!dom.sessionView?.classList.contains("chat-layout-visual-motion")) return;
    dom.sessionView.style.setProperty("--chat-layout-video-scale-x", "1");
    dom.sessionView.style.setProperty("--chat-layout-video-scale-y", "1");
  });

  externalChatVisualMotionTimer = window.setTimeout(() => {
    externalChatVisualMotionTimer = 0;
    dom.sessionView?.classList.remove("chat-layout-visual-motion");
    dom.sessionView?.style.removeProperty("--chat-layout-video-scale-x");
    dom.sessionView?.style.removeProperty("--chat-layout-video-scale-y");
  }, CHAT_LAYOUT_SETTLE_MS + 40);
}

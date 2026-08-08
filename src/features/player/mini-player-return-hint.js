import { dom } from "../../core/dom.js";

export function trackMiniPlayerReturnHint() {
  const frame = dom.playerFrame;
  const button = dom.playerMiniPlayerButton;
  if (!frame || !button) return () => {};

  let animationFrame = 0;
  const sync = () => {
    animationFrame = 0;
    const frameRect = frame.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    if (!frameRect.width || !buttonRect.width) return;

    const center = buttonRect.left - frameRect.left + buttonRect.width / 2;
    const bottom = frameRect.bottom - buttonRect.top + 3;
    frame.style.setProperty("--mini-player-return-button-x", `${center}px`);
    frame.style.setProperty("--mini-player-return-arrow-bottom", `${bottom}px`);
  };
  const requestSync = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(sync);
  };
  const observer = new ResizeObserver(requestSync);

  observer.observe(frame);
  observer.observe(button);
  window.addEventListener("resize", requestSync);
  requestSync();

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", requestSync);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    frame.style.removeProperty("--mini-player-return-button-x");
    frame.style.removeProperty("--mini-player-return-arrow-bottom");
  };
}

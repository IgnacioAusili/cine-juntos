import { SYSTEM_GROUP_TOGGLE_TRANSITION_MS, groupToggleAnimations } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";

export function moveGroupToggle(header, anchor, { animate = false, previousRect = null } = {}) {
  if (!header || !anchor?.isConnected) return;

  const fromRect = animate
    ? previousRect || (header.isConnected ? header.getBoundingClientRect() : null)
    : null;
  cancelGroupToggleAnimation(header);
  const row = anchor.querySelector(".system-message-row") || anchor;
  if (header.parentElement !== row) row.append(header);
  header.style.removeProperty("top");
  header.style.removeProperty("left");
  header.style.removeProperty("right");

  if (!fromRect || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const nextRect = header.getBoundingClientRect();
  const deltaY = fromRect.top - nextRect.top;
  if (Math.abs(deltaY) < 0.5) return;

  const animation = header.animate(
    [
      { transform: `translateY(calc(-50% + ${deltaY}px))` },
      { transform: "translateY(-50%)" },
    ],
    {
      duration: SYSTEM_GROUP_TOGGLE_TRANSITION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
  groupToggleAnimations.set(header, animation);
  const cleanup = () => {
    if (groupToggleAnimations.get(header) !== animation) return;
    animation.cancel();
    groupToggleAnimations.delete(header);
  };
  animation.finished.then(cleanup, cleanup);
}

export function cancelGroupToggleAnimation(header) {
  const animation = groupToggleAnimations.get(header);
  if (!animation) return;
  animation.cancel();
  groupToggleAnimations.delete(header);
}

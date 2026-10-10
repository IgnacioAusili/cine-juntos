import { SYSTEM_GROUP_ENTRY_OFFSET_X, SYSTEM_GROUP_ENTRY_ROTATION, SYSTEM_GROUP_REMOVAL_MS } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";
import { getGroupTransitionTarget } from "./system-message-group-visuals.js?v=20261010-file-size-refactor-02";

export function animateExpandedSystemMessageRemoval(visualState) {
  if (!visualState || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const animations = [];
  visualState.entries.forEach((entry) => {
    if (!entry.target.isConnected) return;

    const finalRect = entry.target.getBoundingClientRect();
    const deltaY = entry.rect.top - finalRect.top;
    if (Math.abs(deltaY) < 0.5) return;

    const animation = entry.target.animate(
      [
        {
          transform: `translate3d(0, ${deltaY}px, 0)`,
        },
        {
          transform: "translate3d(0, 0, 0)",
        },
      ],
      {
        duration: SYSTEM_GROUP_REMOVAL_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animations.push(animation);
  });

  animations.forEach((animation) => {
    animation.finished.then(() => animation.cancel(), () => animation.cancel());
  });
}

export function animateExpandedSystemMessageEntry(item) {
  if (!item?.isConnected || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const target = getGroupTransitionTarget(item);
  if (!target) return;

  const animation = target.animate(
    [
      {
        opacity: 0,
        transform: `translate3d(${SYSTEM_GROUP_ENTRY_OFFSET_X}px, 0, 0) rotate(${SYSTEM_GROUP_ENTRY_ROTATION}deg)`,
      },
      {
        opacity: 1,
        transform: "translate3d(0, 0, 0) rotate(0deg)",
      },
    ],
    {
      duration: SYSTEM_GROUP_REMOVAL_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );

  animation.finished.then(() => animation.cancel(), () => animation.cancel());
}

import { SYSTEM_GROUP_EXPANSION_MS, SYSTEM_GROUP_EXPANSION_STAGGER_MS, SYSTEM_GROUP_TRANSITION_MS, groupTransitions } from "./system-message-group-state.js?v=20261010-file-size-refactor-02";
import { getGroupTransitionTarget, restoreExpansionVisualTransition } from "./system-message-group-visuals.js?v=20261010-file-size-refactor-02";

export function animateGroupTransition(items, header, visualState, expanded) {
  const animations = [];
  const transitionDuration = expanded ? SYSTEM_GROUP_EXPANSION_MS : SYSTEM_GROUP_TRANSITION_MS;

  if (!expanded && visualState?.entries) {
    const finalTarget = getGroupTransitionTarget(items.at(-1));
    const finalRect = finalTarget?.getBoundingClientRect();

    visualState.entries.forEach((entry) => {
      const isLastItem = entry.item === items.at(-1);
      const deltaX = isLastItem && finalRect ? finalRect.left - entry.rect.left : 0;
      const deltaY = isLastItem && finalRect ? finalRect.top - entry.rect.top : -5;
      const animation = entry.clone.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
          {
            opacity: isLastItem ? 1 : 0,
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`,
          },
        ],
        {
          duration: SYSTEM_GROUP_TRANSITION_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      animations.push(animation);
    });
  }

  if (visualState?.layoutEntries) {
    visualState.layoutEntries.forEach((entry) => {
      if (!entry.item.isConnected) return;
      const finalRect = entry.item.getBoundingClientRect();
      const deltaY = entry.rect.top - finalRect.top;
      const deltaX = entry.rect.left - finalRect.left;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      const animation = entry.item.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: transitionDuration,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
      animations.push(animation);
    });
  }

  const scrollAnimation = createGroupScrollAnimation(visualState?.scrollState, items, transitionDuration);

  items.forEach((item, index) => {
    if (!expanded) return;
    const animationTarget = getGroupTransitionTarget(item);
    if (!animationTarget) return;

    const isAnchor = item === items.at(-1);
    const finalRect = animationTarget.getBoundingClientRect();
    const anchorRect = visualState?.anchorRect;
    const deltaX = isAnchor && anchorRect ? anchorRect.left - finalRect.left : 0;
    const deltaY = isAnchor && anchorRect ? anchorRect.top - finalRect.top : -5;
    const delay = isAnchor ? 0 : index * SYSTEM_GROUP_EXPANSION_STAGGER_MS;

    const animation = animationTarget.animate(
      [
        {
          opacity: isAnchor ? 1 : 0,
          transform: `translate3d(${isAnchor ? deltaX : 0}px, ${deltaY}px, 0)`,
        },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: SYSTEM_GROUP_EXPANSION_MS,
        delay,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
    animations.push(animation);
  });

  const finished = Promise.all([
    ...animations.map((animation) => animation.finished.catch(() => undefined)),
    scrollAnimation?.finished,
  ]);
  const transition = {
    animations,
    scrollAnimation,
    finished,
    cleanup: () => {
      // Las animaciones de expansión usan `fill: both` para sostener las
      // filas durante el stagger. Al terminar hay que quitarlas del elemento;
      // si quedan adheridas, interfieren con la siguiente contracción y dejan
      // una copia visual tenue de los mensajes anteriores.
      animations.forEach((animation) => animation.cancel());
      restoreExpansionVisualTransition(visualState);
      visualState?.layer?.remove();
      scrollAnimation?.cancel();
      header.classList.remove("system-group-transitioning");
      items.forEach((item) => item.classList.remove("system-group-transitioning"));
    },
  };
  items.forEach((item) => item.classList.add("system-group-transitioning"));
  groupTransitions.set(header, transition);
  finished.then(() => {
    if (groupTransitions.get(header) !== transition || !header.isConnected) return;
    transition.cleanup();
    groupTransitions.delete(header);
  });
}

function createGroupScrollAnimation(scrollState, items, duration) {
  if (!scrollState?.container) return null;

  const { container, lastBottom } = scrollState;
  const lastRect = items.at(-1)?.getBoundingClientRect();
  if (!lastRect) return null;

  // Ocultar filas puede hacer que el navegador ajuste scrollTop por su cuenta
  // antes de este punto. Animar desde el valor capturado antes del reflow
  // produciría un salto hacia abajo; el valor actual es la posición visual
  // real desde la que debe continuar la transición.
  const startScrollTop = container.scrollTop;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetScrollTop = Math.min(
    maxScrollTop,
    Math.max(0, startScrollTop + lastRect.bottom - lastBottom),
  );
  if (Math.abs(targetScrollTop - startScrollTop) < 0.5) return null;

  let frameId = 0;
  let cancelled = false;
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  const startedAt = performance.now();

  const tick = (now) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    container.scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * eased;
    if (progress < 1) {
      frameId = window.requestAnimationFrame(tick);
    } else {
      resolveFinished();
    }
  };

  frameId = window.requestAnimationFrame(tick);
  return {
    finished,
    cancel: () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resolveFinished?.();
    },
  };
}
export function cancelGroupTransition(header) {
  const transition = groupTransitions.get(header);
  if (!transition) return;
  transition.frameIds?.forEach((frameId) => window.cancelAnimationFrame(frameId));
  transition.animations.forEach((animation) => animation.cancel());
  transition.cleanup?.();
  transition.layer?.remove();
  groupTransitions.delete(header);
}

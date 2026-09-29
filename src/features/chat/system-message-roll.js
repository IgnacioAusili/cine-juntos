const SYSTEM_ROLL_FACE_COUNT = 5;
const SYSTEM_ROLL_ANGLE = 360 / SYSTEM_ROLL_FACE_COUNT;
const SYSTEM_ROLL_DURATION_MS = 1000;
const SYSTEM_ROLL_ROTATION_DELAY_MS = 100;
const SYSTEM_ROLL_ROTATION_DURATION_MS =
  SYSTEM_ROLL_DURATION_MS - SYSTEM_ROLL_ROTATION_DELAY_MS;
const SYSTEM_ROLL_SIZE_TRANSITION_MS = 180;
const systemRollAnimations = new WeakMap();
const systemRollBubbleAnimations = new WeakMap();

/**
 * Hace avanzar el texto visible de un grupo contraído con la misma rueda 3D
 * del prototipo: la cara anterior queda en el frente y la nueva entra con un
 * giro positivo de 72 grados. El snapshot anterior se toma antes de ocultar
 * la fila vieja porque esa fila deja de tener layout durante la transición.
 */
export function animateCollapsedSystemMessageAdvance(previousSnapshot, nextText) {
  if (!previousSnapshot?.markup || !nextText) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return null;

  settleSystemMessageRoll(nextText);

  const nextRect = nextText.getBoundingClientRect();
  const previousRect = previousSnapshot.rect;
  // El mensaje nuevo ya está en layout cuando empieza el giro. La ventana de
  // la rueda debe poder contener ambas caras: conservar solo el tamaño nuevo
  // contrae el panel demasiado pronto al pasar de varias líneas a una sola,
  // mientras que conservar solo el anterior puede hacer que el texto entrante
  // se ajuste contra una caja incorrecta al crecer.
  const lineHeight = Number.parseFloat(getComputedStyle(nextText).lineHeight);
  const lineCount = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(1, Math.round(nextRect.height / lineHeight))
    : 1;
  const nextWidth = Math.max(1, nextRect.width);
  const nextHeight = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(lineHeight, lineCount * lineHeight)
    : Math.max(1, nextRect.height);
  const width = Math.max(nextWidth, previousRect?.width || 0);
  const height = Math.max(nextHeight, previousRect?.height || 0);
  const visualWidth = width;
  const radius = height / (2 * Math.tan(Math.PI / SYSTEM_ROLL_FACE_COUNT));
  const originalNodes = Array.from(nextText.childNodes);
  const originalStyle = nextText.getAttribute("style");
  const bubble = nextText.closest(".message-system-bubble");
  const originalBubbleStyle = bubble?.getAttribute("style");
  const groupItem = nextText.closest(".message.system");
  const hadGroupTransitionClass = groupItem?.classList.contains("system-group-transitioning") ?? false;
  const originalBubbleColor = bubble ? getComputedStyle(bubble).color : "";
  const lineElements = bubble
    ? Array.from(bubble.querySelectorAll(".message-system-line"))
    : [];
  const originalLineStyles = lineElements.map((line) => line.getAttribute("style"));
  const nextBubbleRect = bubble?.getBoundingClientRect();
  const previousBubbleAnimation = bubble && systemRollBubbleAnimations.get(bubble);
  previousBubbleAnimation?.cancel();
  if (bubble && systemRollBubbleAnimations.get(bubble) === previousBubbleAnimation) {
    systemRollBubbleAnimations.delete(bubble);
  }
  const bubbleHeight = Math.max(
    nextBubbleRect?.height || 0,
    previousSnapshot.bubbleRect?.height || 0,
  );
  const bubbleWidth = Math.max(
    nextBubbleRect?.width || 0,
    previousSnapshot.bubbleRect?.width || 0,
  );
  const previousBubbleWidth = previousSnapshot.bubbleRect?.width || nextBubbleRect?.width || 0;
  const lineDisplacement = Math.max(0, (bubbleWidth - previousBubbleWidth) / 2);
  const row = nextText.closest(".system-message-row");
  const previousMarkup = previousSnapshot.markup.cloneNode(true);

  groupItem?.classList.add("system-group-transitioning");

  const drum = document.createElement("span");
  drum.className = "system-message-roll-drum";
  drum.style.setProperty("--system-roll-radius", `${radius}px`);
  drum.style.setProperty("--system-roll-angle", `${SYSTEM_ROLL_ANGLE}deg`);
  drum.style.setProperty("--system-roll-visual-width", `${visualWidth}px`);

  for (let index = 0; index < SYSTEM_ROLL_FACE_COUNT; index += 1) {
    const face = document.createElement("span");
    face.className = "system-message-roll-face";
    face.style.setProperty("--system-roll-index", String(index));

    if (index === 0) {
      face.append(...Array.from(previousMarkup.childNodes).map((node) => node.cloneNode(true)));
    } else if (index === SYSTEM_ROLL_FACE_COUNT - 1) {
      face.append(...originalNodes.map((node) => node.cloneNode(true)));
    }

    drum.append(face);
  }

  nextText.classList.add("system-message-roll-viewport");
  nextText.setAttribute("style", [
    originalStyle,
    `--system-roll-radius: ${radius}px`,
    `--system-roll-width: ${width}px`,
    `--system-roll-height: ${height}px`,
  ].filter(Boolean).join(";"));
  if (bubble && bubbleHeight > 0) {
    bubble.style.setProperty("height", `${bubbleHeight}px`);
  }
  if (bubble && bubbleWidth > 0) {
    bubble.style.setProperty("width", `${bubbleWidth}px`);
  }
  if (bubble && originalBubbleColor) {
    bubble.style.setProperty("color", originalBubbleColor, "important");
  }
  nextText.replaceChildren(drum);
  row?.classList.add("system-message-rolling");

  const initialTransform =
    "translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(0deg)";
  const finalTransform =
    `translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(${SYSTEM_ROLL_ANGLE}deg)`;
  const animation = drum.animate(
    [
      {
        transform: initialTransform,
      },
      {
        transform: finalTransform,
      },
    ],
    {
      duration: SYSTEM_ROLL_ROTATION_DURATION_MS,
      delay: SYSTEM_ROLL_ROTATION_DELAY_MS,
      easing: "cubic-bezier(.65, -.15, .25, 1.15)",
      fill: "both",
    },
  );
  const lineAnimations = [];
  if (lineDisplacement > 0.5 && lineElements.length >= 2) {
    const lineAnimationOptions = {
      duration: SYSTEM_ROLL_ROTATION_DURATION_MS,
      delay: SYSTEM_ROLL_ROTATION_DELAY_MS,
      easing: "cubic-bezier(.65, -.15, .25, 1.15)",
      fill: "both",
    };
    const lineBefore = lineElements[0];
    const lineAfter = lineElements.at(-1);
    const beforeStart = `translateX(${lineDisplacement}px)`;
    const afterStart = `translateX(-${lineDisplacement}px)`;
    lineBefore.style.transform = beforeStart;
    lineAfter.style.transform = afterStart;
    lineAnimations.push(
      lineBefore.animate(
        [{ transform: beforeStart }, { transform: "translateX(0px)" }],
        lineAnimationOptions,
      ),
      lineAfter.animate(
        [{ transform: afterStart }, { transform: "translateX(0px)" }],
        lineAnimationOptions,
      ),
    );
  }

  const record = { animation, cleanup: null };
  systemRollAnimations.set(nextText, record);
  let cleanupStarted = false;
  let bubbleSizeAnimation = null;
  let textSizeAnimation = null;
  let bubbleFinalized = false;
  const finalizeBubble = () => {
    if (bubbleFinalized || systemRollAnimations.get(nextText) !== record) return;
    if (
      bubble &&
      bubbleSizeAnimation &&
      systemRollBubbleAnimations.get(bubble) !== bubbleSizeAnimation
    ) return;
    bubbleFinalized = true;
    bubbleSizeAnimation?.cancel();
    textSizeAnimation?.cancel();
    lineAnimations.forEach((lineAnimation) => lineAnimation.cancel());
    lineElements.forEach((line, index) => {
      const originalLineStyle = originalLineStyles[index];
      if (originalLineStyle === null) line.removeAttribute("style");
      else line.setAttribute("style", originalLineStyle);
    });
    nextText.replaceChildren(...originalNodes);
    if (originalStyle === null) nextText.removeAttribute("style");
    else nextText.setAttribute("style", originalStyle);
    nextText.classList.remove("system-message-roll-viewport");
    row?.classList.remove("system-message-rolling");
    if (!hadGroupTransitionClass) groupItem?.classList.remove("system-group-transitioning");
    if (bubble) {
      if (originalBubbleStyle === null) bubble.removeAttribute("style");
      else bubble.setAttribute("style", originalBubbleStyle);
      if (systemRollBubbleAnimations.get(bubble) === bubbleSizeAnimation) {
        systemRollBubbleAnimations.delete(bubble);
      }
    }
    systemRollAnimations.delete(nextText);
    animation.cancel();
  };
  const cancelSizeAnimations = () => {
    bubbleSizeAnimation?.cancel();
    textSizeAnimation?.cancel();
  };
  const startSizeTransition = () => {
    const finalTextWidth = Math.max(1, nextRect.width);
    const finalTextHeight = Math.max(1, nextRect.height);
    const finalBubbleWidth = nextBubbleRect?.width || bubbleWidth;
    const finalBubbleHeight = nextBubbleRect?.height || bubbleHeight;
    const transition = {
      duration: SYSTEM_ROLL_SIZE_TRANSITION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    };
    const animations = [];
    if (
      bubble &&
      (bubbleWidth > finalBubbleWidth + 0.5 || bubbleHeight > finalBubbleHeight + 0.5)
    ) {
      bubbleSizeAnimation = bubble.animate(
        [
          { width: `${bubbleWidth}px`, height: `${bubbleHeight}px` },
          { width: `${finalBubbleWidth}px`, height: `${finalBubbleHeight}px` },
        ],
        transition,
      );
      record.bubbleSizeAnimation = bubbleSizeAnimation;
      systemRollBubbleAnimations.set(bubble, bubbleSizeAnimation);
      animations.push(bubbleSizeAnimation);
    }
    if (width > finalTextWidth + 0.5 || height > finalTextHeight + 0.5) {
      textSizeAnimation = nextText.animate(
        [
          { width: `${width}px`, height: `${height}px` },
          { width: `${finalTextWidth}px`, height: `${finalTextHeight}px` },
        ],
        transition,
      );
      animations.push(textSizeAnimation);
    }
    if (!animations.length) return false;
    Promise.all(animations.map((entry) => entry.finished.catch(() => null)))
      .then(finalizeBubble, finalizeBubble);
    return true;
  };
  const cleanup = ({ immediate = false } = {}) => {
    if (systemRollAnimations.get(nextText) !== record) return;
    if (cleanupStarted) {
      if (immediate) {
        cancelSizeAnimations();
        finalizeBubble();
      }
      return;
    }
    cleanupStarted = true;
    if (immediate) {
      cancelSizeAnimations();
      finalizeBubble();
      return;
    }
    if (startSizeTransition()) return;
    finalizeBubble();
  };
  record.cleanup = cleanup;

  animation.finished.then(cleanup, cleanup);
  return animation;
}

export function settleSystemMessageRoll(target) {
  const record = systemRollAnimations.get(target);
  record?.cleanup?.({ immediate: true });
}

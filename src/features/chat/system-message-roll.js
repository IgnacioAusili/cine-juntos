const SYSTEM_ROLL_FACE_COUNT = 10;
const SYSTEM_ROLL_FACE_ANGLE = 360 / SYSTEM_ROLL_FACE_COUNT;
const SYSTEM_ROLL_TURN_FACES = 3;
const SYSTEM_ROLL_TURN_ANGLE = SYSTEM_ROLL_FACE_ANGLE * SYSTEM_ROLL_TURN_FACES;
const SYSTEM_ROLL_INCOMING_FACE_INDEX = SYSTEM_ROLL_FACE_COUNT - SYSTEM_ROLL_TURN_FACES;
const SYSTEM_ROLL_DURATION_MS = 420;
const SYSTEM_ROLL_ROTATION_DELAY_MS = 0;
const SYSTEM_ROLL_ROTATION_DURATION_MS =
  SYSTEM_ROLL_DURATION_MS - SYSTEM_ROLL_ROTATION_DELAY_MS;
const SYSTEM_ROLL_SIZE_TRANSITION_MS = 140;
const SYSTEM_ROLL_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";
const SYSTEM_ROLL_ROTATION_EASING = "linear";
const systemRollAnimations = new WeakMap();
const systemRollBubbleAnimations = new WeakMap();
const systemMessageRowAnchors = new WeakMap();
const systemMessageRowAnchorAnimations = new WeakMap();

/**
 * Hace avanzar el texto visible de un grupo contraído con la misma rueda 3D
 * del prototipo: la cara anterior deja el frente y la nueva entra con un
 * giro positivo de 108 grados. El snapshot anterior se toma antes de ocultar
 * la fila vieja porque esa fila deja de tener layout durante la transición.
 */
export function animateCollapsedSystemMessageAdvance(previousSnapshot, nextText) {
  if (!previousSnapshot?.markup || !nextText) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    const row = nextText.closest(".system-message-row");
    const previousRowRect = previousSnapshot.rowRect || previousSnapshot.bubbleRect;
    const currentRowRect = row?.getBoundingClientRect();
    if (row && previousRowRect && currentRowRect) {
      const anchor = getSystemMessageRowAnchorState(row);
      const previousCenter = previousRowRect.top + previousRowRect.height / 2;
      const currentCenter = currentRowRect.top + currentRowRect.height / 2;
      const offset = getNumericComputedStyle(row, "top") + previousCenter - currentCenter - anchor.baseTop;
      setSystemMessageRowAnchorOffset(row, anchor, offset);
    }
    return null;
  }

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
  // El redondeo por líneas puede perder los decimales de la caja real y
  // obligar al texto a crecer de golpe al restaurarlo al terminar el giro.
  const nextHeight = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(lineHeight, lineCount * lineHeight, nextRect.height)
    : Math.max(1, nextRect.height);
  const width = Math.max(nextWidth, previousRect?.width || 0);
  const height = Math.max(nextHeight, previousRect?.height || 0);
  const visualWidth = width;
  // Un radio mayor hace más evidente el recorrido circular de cada cara;
  // el mínimo relativo al renglón mantiene la misma curvatura en textos cortos.
  const radius = Math.max(
    height / 6.5,
    Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight * 0.8 : 0,
  );
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
  const row = nextText.closest(".system-message-row");
  const nextRowRect = row?.getBoundingClientRect() || null;
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
  const previousMarkup = previousSnapshot.markup.cloneNode(true);

  groupItem?.classList.add("system-group-transitioning");

  const drum = document.createElement("span");
  drum.className = "system-message-roll-drum";
  drum.style.setProperty("--system-roll-radius", `${radius}px`);
  drum.style.setProperty("--system-roll-angle", `${SYSTEM_ROLL_FACE_ANGLE}deg`);
  drum.style.setProperty("--system-roll-visual-width", `${visualWidth}px`);
  for (let index = 0; index < SYSTEM_ROLL_FACE_COUNT; index += 1) {
    const face = document.createElement("span");
    face.className = "system-message-roll-face";
    face.style.setProperty("--system-roll-index", String(index));
    let contentNodes = null;

    if (index === 0) {
      contentNodes = Array.from(previousMarkup.childNodes).map((node) => node.cloneNode(true));
    } else if (index === SYSTEM_ROLL_INCOMING_FACE_INDEX) {
      contentNodes = originalNodes.map((node) => node.cloneNode(true));
    }

    if (contentNodes) {
      const content = document.createElement("span");
      content.className = "system-message-roll-content";
      content.append(...contentNodes);
      face.append(content);
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

  // El renglón crece alrededor del centro que tenía el mensaje anterior. Así
  // las líneas y el selector permanecen en su eje; no se los anima siguiendo
  // el aumento de alto del texto.
  let rowAnchorState = null;
  let rowAnchorStartOffset = 0;
  let rowAnchorFinalOffset = 0;
  let rowAnchorAnimation = null;
  const previousRowRect = previousSnapshot.rowRect || previousSnapshot.bubbleRect;
  const rowRectAtReservedSize = row?.getBoundingClientRect();
  if (row && previousRowRect && rowRectAtReservedSize) {
    rowAnchorState = getSystemMessageRowAnchorState(row);
    const previousCenter = previousRowRect.top + previousRowRect.height / 2;
    const currentCenter = rowRectAtReservedSize.top + rowRectAtReservedSize.height / 2;
    const currentTop = getNumericComputedStyle(row, "top");
    const rowHeightChange = Math.max(
      0,
      rowRectAtReservedSize.height - (nextRowRect?.height || rowRectAtReservedSize.height),
    );
    rowAnchorStartOffset = currentTop + previousCenter - currentCenter - rowAnchorState.baseTop;
    rowAnchorFinalOffset = rowAnchorStartOffset + rowHeightChange / 2;
    setSystemMessageRowAnchorOffset(row, rowAnchorState, rowAnchorStartOffset);
  }

  const initialTransform =
    "translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(0deg)";
  const finalTransform =
    `translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(${SYSTEM_ROLL_TURN_ANGLE}deg)`;
  // El giro empieza a velocidad constante para que no haya un tramo inicial
  // casi plano que se perciba como una simple subida del texto.
  const rotationOptions = {
    duration: SYSTEM_ROLL_ROTATION_DURATION_MS,
    delay: SYSTEM_ROLL_ROTATION_DELAY_MS,
    easing: SYSTEM_ROLL_ROTATION_EASING,
    fill: "both",
  };
  const animation = drum.animate(
    [
      {
        transform: initialTransform,
      },
      {
        transform: finalTransform,
      },
    ],
    rotationOptions,
  );
  // El texto rota unido a su cara: contrarrotarlo lo mantenía casi frontal y
  // hacía que la ruleta se percibiera como un simple desplazamiento vertical.
  const lineAnimations = [];
  if (lineDisplacement > 0.5 && lineElements.length >= 2) {
    const lineAnimationOptions = {
      duration: SYSTEM_ROLL_ROTATION_DURATION_MS,
      delay: SYSTEM_ROLL_ROTATION_DELAY_MS,
      easing: SYSTEM_ROLL_EASING,
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
    rowAnchorAnimation?.cancel();
    if (row && systemMessageRowAnchorAnimations.get(row) === rowAnchorAnimation) {
      systemMessageRowAnchorAnimations.delete(row);
    }
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
    rowAnchorAnimation?.cancel();
    if (row && systemMessageRowAnchorAnimations.get(row) === rowAnchorAnimation) {
      systemMessageRowAnchorAnimations.delete(row);
    }
  };
  const startSizeTransition = () => {
    const finalTextWidth = Math.max(1, nextRect.width);
    const finalTextHeight = Math.max(1, nextRect.height);
    const finalBubbleWidth = nextBubbleRect?.width || bubbleWidth;
    const finalBubbleHeight = nextBubbleRect?.height || bubbleHeight;
    const transition = {
      duration: SYSTEM_ROLL_SIZE_TRANSITION_MS,
      easing: SYSTEM_ROLL_EASING,
      fill: "forwards",
    };
    const animations = [];
    if (
      row && rowAnchorState && Math.abs(rowAnchorFinalOffset - rowAnchorStartOffset) > 0.5
    ) {
      setSystemMessageRowAnchorOffset(row, rowAnchorState, rowAnchorFinalOffset);
      rowAnchorAnimation = row.animate(
        [
          {
            top: `${rowAnchorState.baseTop + rowAnchorStartOffset}px`,
            marginBottom: `${rowAnchorState.baseMarginBottom + rowAnchorStartOffset}px`,
          },
          {
            top: `${rowAnchorState.baseTop + rowAnchorFinalOffset}px`,
            marginBottom: `${rowAnchorState.baseMarginBottom + rowAnchorFinalOffset}px`,
          },
        ],
        transition,
      );
      systemMessageRowAnchorAnimations.set(row, rowAnchorAnimation);
      const rowAnimation = rowAnchorAnimation;
      rowAnimation.finished.then(() => {
        if (systemMessageRowAnchorAnimations.get(row) !== rowAnimation) return;
        rowAnimation.cancel();
        systemMessageRowAnchorAnimations.delete(row);
      }, () => undefined);
      animations.push(rowAnchorAnimation);
    }
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

/** Devuelve una fila de sistema a su posición natural al expandir el grupo. */
export function resetSystemMessageRowAnchor(target) {
  const row = target?.matches?.(".system-message-row")
    ? target
    : target?.querySelector?.(".system-message-row");
  if (!row) return;

  const animation = systemMessageRowAnchorAnimations.get(row);
  animation?.cancel();
  if (systemMessageRowAnchorAnimations.get(row) === animation) {
    systemMessageRowAnchorAnimations.delete(row);
  }
  const state = systemMessageRowAnchors.get(row);
  if (!state) return;

  restoreInlineProperty(row, "top", state.originalTop);
  restoreInlineProperty(row, "margin-bottom", state.originalMarginBottom);
  systemMessageRowAnchors.delete(row);
}

function getSystemMessageRowAnchorState(row) {
  let state = systemMessageRowAnchors.get(row);
  if (state) return state;

  const computed = getComputedStyle(row);
  state = {
    originalTop: captureInlineProperty(row, "top"),
    originalMarginBottom: captureInlineProperty(row, "margin-bottom"),
    baseTop: Number.parseFloat(computed.top) || 0,
    baseMarginBottom: Number.parseFloat(computed.marginBottom) || 0,
  };
  systemMessageRowAnchors.set(row, state);
  return state;
}

function setSystemMessageRowAnchorOffset(row, state, offset) {
  row.style.setProperty("top", `${state.baseTop + offset}px`);
  row.style.setProperty("margin-bottom", `${state.baseMarginBottom + offset}px`);
}

function captureInlineProperty(element, property) {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreInlineProperty(element, property, original) {
  if (original.value) element.style.setProperty(property, original.value, original.priority);
  else element.style.removeProperty(property);
}

function getNumericComputedStyle(element, property) {
  return Number.parseFloat(getComputedStyle(element).getPropertyValue(property)) || 0;
}

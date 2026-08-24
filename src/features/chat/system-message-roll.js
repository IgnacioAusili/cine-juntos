const SYSTEM_ROLL_FACE_COUNT = 5;
const SYSTEM_ROLL_ANGLE = 360 / SYSTEM_ROLL_FACE_COUNT;
const SYSTEM_ROLL_DURATION_MS = 650;
const systemRollAnimations = new WeakMap();

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
  // El mensaje nuevo ya está en layout cuando empieza el giro. Usar también
  // el ancho anterior aquí puede agrandar la burbuja en ese instante y mover
  // sus bordes hacia ambos lados. El viewport conserva el ancho que ya tenía
  // el mensaje nuevo; el texto anterior queda recortado por la máscara si es
  // más largo, sin alterar la geometría de la fila.
  const width = Math.max(1, nextRect.width);
  const visualWidth = Math.max(width, previousRect?.width || 0);
  const lineHeight = Number.parseFloat(getComputedStyle(nextText).lineHeight);
  const lineCount = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(1, Math.round(nextRect.height / lineHeight))
    : 1;
  const height = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(lineHeight, lineCount * lineHeight)
    : Math.max(1, nextRect.height, previousRect?.height || 0);
  const radius = height / (2 * Math.tan(Math.PI / SYSTEM_ROLL_FACE_COUNT));
  const originalNodes = Array.from(nextText.childNodes);
  const originalStyle = nextText.getAttribute("style");
  const row = nextText.closest(".system-message-row");
  const previousMarkup = previousSnapshot.markup.cloneNode(true);

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
  nextText.replaceChildren(drum);
  row?.classList.add("system-message-rolling");

  const animation = drum.animate(
    [
      {
        transform: "translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(0deg)",
      },
      {
        transform: `translateX(-50%) translateZ(calc(var(--system-roll-radius) * -1)) rotateX(${SYSTEM_ROLL_ANGLE}deg)`,
      },
    ],
    {
      duration: SYSTEM_ROLL_DURATION_MS,
      easing: "cubic-bezier(.65, -.15, .25, 1.15)",
      fill: "both",
    },
  );

  const record = { animation, cleanup: null };
  systemRollAnimations.set(nextText, record);
  const cleanup = () => {
    if (systemRollAnimations.get(nextText) !== record) return;
    nextText.replaceChildren(...originalNodes);
    if (originalStyle === null) nextText.removeAttribute("style");
    else nextText.setAttribute("style", originalStyle);
    nextText.classList.remove("system-message-roll-viewport");
    row?.classList.remove("system-message-rolling");
    animation.cancel();
    systemRollAnimations.delete(nextText);
  };
  record.cleanup = cleanup;

  animation.finished.then(cleanup, cleanup);
  return animation;
}

export function settleSystemMessageRoll(target) {
  const record = systemRollAnimations.get(target);
  record?.cleanup?.();
}

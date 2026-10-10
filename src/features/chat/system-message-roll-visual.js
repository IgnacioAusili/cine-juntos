export const SYSTEM_ROLL_FACE_COUNT = 16;
export const SYSTEM_ROLL_FACE_ANGLE = 360 / SYSTEM_ROLL_FACE_COUNT;
export const SYSTEM_ROLL_TURN_FACES = 3;
export const SYSTEM_ROLL_TURN_ANGLE = SYSTEM_ROLL_FACE_ANGLE * SYSTEM_ROLL_TURN_FACES;
export const SYSTEM_ROLL_INCOMING_FACE_INDEX = SYSTEM_ROLL_TURN_FACES;
export const SYSTEM_ROLL_DURATION_MS = 600;
export const SYSTEM_ROLL_EASING = "cubic-bezier(0.6, 0.05, 0.25, 1)";

const PROTOTYPE_FACE_HEIGHT = 36;
const COMPACT_RADIUS = 27;
const COMPACT_STAGE_HEIGHT = 84;
const COMPACT_PERSPECTIVE = 432;
const SYSTEM_ROLL_FADE_DURATION = SYSTEM_ROLL_DURATION_MS * 0.85;

export function getSystemRollGeometry(faceHeight) {
  const scale = Math.max(1, faceHeight) / PROTOTYPE_FACE_HEIGHT;
  return {
    radius: COMPACT_RADIUS * scale,
    stageHeight: COMPACT_STAGE_HEIGHT * scale,
    perspective: COMPACT_PERSPECTIVE * scale,
  };
}

export function createSystemRollStage(previousMarkup, nextNodes, geometry) {
  const stage = document.createElement("span");
  stage.className = "system-message-roll-stage";
  stage.style.setProperty("--system-roll-radius", `${geometry.radius}px`);
  stage.style.setProperty("--system-roll-angle", `${SYSTEM_ROLL_FACE_ANGLE}deg`);
  stage.style.setProperty("--system-roll-visual-width", `${geometry.width}px`);
  stage.style.setProperty("--system-roll-face-height", `${geometry.faceHeight}px`);
  stage.style.setProperty("--system-roll-stage-height", `${geometry.stageHeight}px`);
  stage.style.setProperty("--system-roll-perspective", `${geometry.perspective}px`);

  const drum = document.createElement("span");
  drum.className = "system-message-roll-drum";
  const faces = [];
  for (let index = 0; index < SYSTEM_ROLL_FACE_COUNT; index += 1) {
    const face = document.createElement("span");
    face.className = "system-message-roll-face";
    face.style.transform = `rotateX(${-index * SYSTEM_ROLL_FACE_ANGLE}deg) translateZ(${geometry.radius}px)`;
    face.style.opacity = index === SYSTEM_ROLL_INCOMING_FACE_INDEX ? "0" : "1";
    const contentNodes = index === 0
      ? Array.from(previousMarkup.childNodes).map((node) => node.cloneNode(true))
      : index === SYSTEM_ROLL_INCOMING_FACE_INDEX
        ? nextNodes.map((node) => node.cloneNode(true))
        : null;

    if (contentNodes) {
      const content = document.createElement("span");
      content.className = "system-message-roll-content";
      content.append(...contentNodes);
      face.append(content);
    }
    faces.push(face);
    drum.append(face);
  }

  stage.append(drum);
  return {
    stage,
    drum,
    previousFace: faces[0],
    incomingFace: faces[SYSTEM_ROLL_INCOMING_FACE_INDEX],
    radius: geometry.radius,
  };
}

export function startSystemRollAnimations(visual) {
  const initialTransform = `translateZ(-${visual.radius}px) rotateX(0deg)`;
  const finalTransform =
    `translateZ(-${visual.radius}px) rotateX(${SYSTEM_ROLL_TURN_ANGLE}deg)`;
  const rotation = visual.drum.animate(
    [{ transform: initialTransform }, { transform: finalTransform }],
    {
      duration: SYSTEM_ROLL_DURATION_MS,
      easing: SYSTEM_ROLL_EASING,
      fill: "both",
    },
  );
  const fadeOptions = {
    duration: SYSTEM_ROLL_FADE_DURATION,
    easing: "ease",
    fill: "both",
  };
  const faces = [
    visual.previousFace.animate([{ opacity: 1 }, { opacity: 0 }], fadeOptions),
    visual.incomingFace.animate([{ opacity: 0 }, { opacity: 1 }], fadeOptions),
  ];
  return { rotation, faces };
}

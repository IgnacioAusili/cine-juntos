import {
  createSystemRollStage,
  getSystemRollGeometry,
  startSystemRollAnimations,
  SYSTEM_ROLL_DURATION_MS,
  SYSTEM_ROLL_EASING,
} from "./system-message-roll-visual.js?v=20261009-system-roll-compact-02";
import {
  animateReducedMotionRowAnchor,
  captureSystemMessageRowAnchor,
  resetSystemMessageRowAnchor,
  systemMessageRowAnchorAnimations,
} from "./system-message-roll-layout.js?v=20261009-system-roll-compact-02";
import { createSystemRollCleanup } from "./system-message-roll-cleanup.js?v=20261009-system-roll-compact-02";

const SYSTEM_ROLL_SIZE_TRANSITION_MS = 90;
const systemRollAnimations = new WeakMap();
const systemRollBubbleAnimations = new WeakMap();

export function animateCollapsedSystemMessageAdvance(previousSnapshot, nextText) {
  if (!previousSnapshot?.markup || !nextText) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    animateReducedMotionRowAnchor(nextText, previousSnapshot);
    return null;
  }

  settleSystemMessageRoll(nextText);
  const nextRect = nextText.getBoundingClientRect();
  const previousRect = previousSnapshot.rect;
  const lineHeight = Number.parseFloat(getComputedStyle(nextText).lineHeight);
  const lineCount = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(1, Math.round(nextRect.height / lineHeight))
    : 1;
  const nextWidth = Math.max(1, nextRect.width);
  const nextHeight = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(lineHeight, lineCount * lineHeight, nextRect.height)
    : Math.max(1, nextRect.height);
  const width = Math.max(nextWidth, previousRect?.width || 0);
  const height = Math.max(nextHeight, previousRect?.height || 0);
  const geometry = getSystemRollGeometry(height);
  const originalNodes = Array.from(nextText.childNodes);
  const originalStyle = nextText.getAttribute("style");
  const bubble = nextText.closest(".message-system-bubble");
  const originalBubbleStyle = bubble?.getAttribute("style");
  const groupItem = nextText.closest(".message.system");
  const hadGroupTransitionClass = groupItem?.classList.contains("system-group-transitioning") ?? false;
  const originalBubbleColor = bubble ? getComputedStyle(bubble).color : "";
  const lineElements = bubble ? Array.from(bubble.querySelectorAll(".message-system-line")) : [];
  const originalLineStyles = lineElements.map((line) => line.getAttribute("style"));
  const nextBubbleRect = bubble?.getBoundingClientRect();
  const row = nextText.closest(".system-message-row");
  const nextRowRect = row?.getBoundingClientRect() || null;
  const previousBubbleAnimation = bubble && systemRollBubbleAnimations.get(bubble);
  previousBubbleAnimation?.cancel();
  if (bubble && systemRollBubbleAnimations.get(bubble) === previousBubbleAnimation) {
    systemRollBubbleAnimations.delete(bubble);
  }

  const bubbleHeight = Math.max(nextBubbleRect?.height || 0, previousSnapshot.bubbleRect?.height || 0);
  const bubbleWidth = Math.max(nextBubbleRect?.width || 0, previousSnapshot.bubbleRect?.width || 0);
  const previousBubbleWidth = previousSnapshot.bubbleRect?.width || nextBubbleRect?.width || 0;
  const lineDisplacement = Math.max(0, (bubbleWidth - previousBubbleWidth) / 2);
  const visual = createSystemRollStage(previousSnapshot.markup, originalNodes, {
    width,
    faceHeight: height,
    ...geometry,
  });

  groupItem?.classList.add("system-group-transitioning");
  nextText.classList.add("system-message-roll-viewport");
  nextText.setAttribute("style", [
    originalStyle,
    `--system-roll-width: ${width}px`,
    `--system-roll-height: ${height}px`,
  ].filter(Boolean).join(";"));
  if (bubble && bubbleHeight > 0) bubble.style.setProperty("height", `${bubbleHeight}px`);
  if (bubble && bubbleWidth > 0) bubble.style.setProperty("width", `${bubbleWidth}px`);
  if (bubble && originalBubbleColor) bubble.style.setProperty("color", originalBubbleColor, "important");
  nextText.replaceChildren(visual.stage);
  row?.classList.add("system-message-rolling");

  const previousRowRect = previousSnapshot.rowRect || previousSnapshot.bubbleRect;
  const rowRectAtReservedSize = row?.getBoundingClientRect();
  const rowAnchor = captureSystemMessageRowAnchor(
    row,
    previousRowRect,
    rowRectAtReservedSize,
    nextRowRect,
  );
  const rollAnimations = startSystemRollAnimations(visual);
  const lineAnimations = animateSystemMessageLines(lineElements, lineDisplacement);
  const record = { animation: rollAnimations.rotation, cleanup: null };
  systemRollAnimations.set(nextText, record);
  const cleanup = createSystemRollCleanup({
    nextText,
    record,
    systemRollAnimations,
    systemRollBubbleAnimations,
    bubble,
    row,
    groupItem,
    hadGroupTransitionClass,
    originalNodes,
    originalStyle,
    originalBubbleStyle,
    originalLineStyles,
    lineElements,
    lineAnimations,
    faceAnimations: rollAnimations.faces,
    animation: rollAnimations.rotation,
    rowAnchor,
    rowAnchorAnimations: systemMessageRowAnchorAnimations,
    width,
    height,
    nextRect,
    nextBubbleRect,
    bubbleWidth,
    bubbleHeight,
    sizeTransitionDuration: SYSTEM_ROLL_SIZE_TRANSITION_MS,
    easing: SYSTEM_ROLL_EASING,
  });
  record.cleanup = cleanup;
  rollAnimations.rotation.finished.then(cleanup, cleanup);
  return rollAnimations.rotation;
}

export function settleSystemMessageRoll(target) {
  systemRollAnimations.get(target)?.cleanup?.({ immediate: true });
}

export { resetSystemMessageRowAnchor };

function animateSystemMessageLines(lineElements, displacement) {
  if (displacement <= 0.5 || lineElements.length < 2) return [];
  const options = {
    duration: SYSTEM_ROLL_DURATION_MS,
    easing: SYSTEM_ROLL_EASING,
    fill: "both",
  };
  const before = lineElements[0];
  const after = lineElements.at(-1);
  const beforeStart = `translateX(${displacement}px)`;
  const afterStart = `translateX(-${displacement}px)`;
  before.style.transform = beforeStart;
  after.style.transform = afterStart;
  return [
    before.animate([{ transform: beforeStart }, { transform: "translateX(0px)" }], options),
    after.animate([{ transform: afterStart }, { transform: "translateX(0px)" }], options),
  ];
}

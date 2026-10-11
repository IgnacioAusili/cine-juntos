import { setSystemMessageRowAnchorOffset } from "./system-message-roll-layout.js?v=20261010-file-size-refactor-02";

export function createSystemRollCleanup(context) {
  const {
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
    faceAnimations,
    animation,
    rowAnchor,
    rowAnchorAnimations,
    width,
    height,
    nextRect,
    nextBubbleRect,
    bubbleWidth,
    bubbleHeight,
    sizeTransitionDuration,
    easing,
  } = context;
  let cleanupStarted = false;
  let bubbleSizeAnimation = null;
  let textSizeAnimation = null;
  let rowAnchorAnimation = null;
  let bubbleFinalized = false;

  const finalizeBubble = () => {
    if (bubbleFinalized || systemRollAnimations.get(nextText) !== record) return;
    if (bubble && bubbleSizeAnimation && systemRollBubbleAnimations.get(bubble) !== bubbleSizeAnimation) return;
    bubbleFinalized = true;
    bubbleSizeAnimation?.cancel();
    textSizeAnimation?.cancel();
    rowAnchorAnimation?.cancel();
    if (row && rowAnchorAnimations.get(row) === rowAnchorAnimation) rowAnchorAnimations.delete(row);
    lineAnimations.forEach((entry) => entry.cancel());
    faceAnimations.forEach((entry) => entry.cancel());
    lineElements.forEach((line, index) => {
      const original = originalLineStyles[index];
      if (original === null) line.removeAttribute("style");
      else line.setAttribute("style", original);
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
    if (row && rowAnchorAnimations.get(row) === rowAnchorAnimation) rowAnchorAnimations.delete(row);
  };

  const startSizeTransition = () => {
    const finalTextWidth = Math.max(1, nextRect.width);
    const finalTextHeight = Math.max(1, nextRect.height);
    const finalBubbleWidth = nextBubbleRect?.width || bubbleWidth;
    const finalBubbleHeight = nextBubbleRect?.height || bubbleHeight;
    const transition = { duration: sizeTransitionDuration, easing, fill: "forwards" };
    const animations = [];

    if (row && rowAnchor && Math.abs(rowAnchor.finalOffset - rowAnchor.startOffset) > 0.5) {
      setSystemMessageRowAnchorOffset(row, rowAnchor.state, rowAnchor.finalOffset);
      rowAnchorAnimation = row.animate(
        [
          {
            top: `${rowAnchor.state.baseTop + rowAnchor.startOffset}px`,
            marginBottom: `${rowAnchor.state.baseMarginBottom + rowAnchor.startOffset}px`,
          },
          {
            top: `${rowAnchor.state.baseTop + rowAnchor.finalOffset}px`,
            marginBottom: `${rowAnchor.state.baseMarginBottom + rowAnchor.finalOffset}px`,
          },
        ],
        transition,
      );
      rowAnchorAnimations.set(row, rowAnchorAnimation);
      const currentAnimation = rowAnchorAnimation;
      currentAnimation.finished.then(() => {
        if (rowAnchorAnimations.get(row) !== currentAnimation) return;
        currentAnimation.cancel();
        rowAnchorAnimations.delete(row);
      }, () => undefined);
      animations.push(rowAnchorAnimation);
    }

    if (bubble && (bubbleWidth > finalBubbleWidth + 0.5 || bubbleHeight > finalBubbleHeight + 0.5)) {
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

  return cleanup;
}

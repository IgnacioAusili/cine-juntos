import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { formatSeconds } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { hideTooltip } from "../icons-tooltips.js?v=20261010-file-size-refactor-02";
import { seekTooltipState } from "./player-seek-tooltip-state.js?v=20261010-file-size-refactor-02";

const SEEK_TOOLTIP_GAP = 10;
const SEEK_TOOLTIP_VIEWPORT_PADDING = 8;
const SEEK_THUMB_WIDTH = 14;
const SEEK_TOOLTIP_ARROW_PADDING = SEEK_THUMB_WIDTH / 2 + 1;
const SEEK_TOOLTIP_EDGE_RADIUS = 9;
const SEEK_TOOLTIP_DEFAULT_RADIUS = 12;
const SEEK_TOOLTIP_EDGE_TRANSITION_DISTANCE = 24;
const SEEK_TOOLTIP_HORIZONTAL_PADDING = SEEK_TOOLTIP_ARROW_PADDING / 2;

export function updateSeekTooltipForValue(value) {
  if (!seekTooltipState.point || !dom.tooltipLayer || dom.playerSeekInput?.disabled) return;
  showSeekTooltip(value, seekTooltipState.point.x, seekTooltipState.rect);
}

export function showSeekTooltip(value, clientX, rect) {
  if (!dom.tooltipLayer) return;

  const isVisibleSeekTooltip = Boolean(seekTooltipState.point && !dom.tooltipLayer.hidden);
  if (!isVisibleSeekTooltip) {
    // hideTooltip también limpia la variable CSS; reiniciar el caché evita
    // omitir la escritura cuando el tooltip vuelve a aparecer en un extremo.
    seekTooltipState.arrowOffset = null;
    seekTooltipState.edge = null;
    seekTooltipState.edgeRadius = null;
    seekTooltipState.placement = null;
    seekTooltipState.size = null;
    hideTooltip(true);
    dom.tooltipLayer.removeAttribute("data-edge");
  }

  seekTooltipState.point = { x: clientX };
  seekTooltipState.rect = rect || null;
  const nextText = formatSeconds(value);
  if (dom.tooltipLayer.textContent !== nextText) {
    dom.tooltipLayer.textContent = nextText;
    seekTooltipState.size = null;
  }

  if (!isVisibleSeekTooltip) {
    dom.tooltipLayer.hidden = false;
    dom.tooltipLayer.style.visibility = "hidden";
    dom.tooltipLayer.style.left = "0px";
    dom.tooltipLayer.style.top = "0px";
    dom.tooltipLayer.dataset.placement = "top";
  }

  if (seekTooltipState.tooltipFrame) return;

  seekTooltipState.tooltipFrame = window.requestAnimationFrame(() => {
    seekTooltipState.tooltipFrame = 0;
    if (!dom.tooltipLayer || dom.tooltipLayer.hidden) return;
    positionSeekTooltip();
    dom.tooltipLayer.style.visibility = "";
  });
}


function positionSeekTooltip() {
  if (!dom.tooltipLayer || !seekTooltipState.point || !seekTooltipState.rect) return;

  if (!seekTooltipState.size) {
    const tooltipRect = dom.tooltipLayer.getBoundingClientRect();
    seekTooltipState.size = { width: tooltipRect.width, height: tooltipRect.height };
  }
  const tooltipWidth = seekTooltipState.size.width;
  const tooltipHeight = seekTooltipState.size.height;
  const maxLeft = Math.max(
    SEEK_TOOLTIP_HORIZONTAL_PADDING,
    window.innerWidth - tooltipWidth - SEEK_TOOLTIP_HORIZONTAL_PADDING,
  );
  const maxTop = Math.max(SEEK_TOOLTIP_VIEWPORT_PADDING, window.innerHeight - tooltipHeight - SEEK_TOOLTIP_VIEWPORT_PADDING);
  const centeredLeft = seekTooltipState.point.x - tooltipWidth / 2;
  const left = Math.min(Math.max(centeredLeft, SEEK_TOOLTIP_HORIZONTAL_PADDING), maxLeft);
  const aboveTop = seekTooltipState.rect.top - tooltipHeight - SEEK_TOOLTIP_GAP;
  const belowTop = seekTooltipState.rect.bottom + SEEK_TOOLTIP_GAP;
  const canShowAbove = aboveTop >= SEEK_TOOLTIP_VIEWPORT_PADDING;
  const top = canShowAbove
    ? Math.min(Math.max(aboveTop, SEEK_TOOLTIP_VIEWPORT_PADDING), maxTop)
    : Math.min(Math.max(belowTop, SEEK_TOOLTIP_VIEWPORT_PADDING), maxTop);
  const isHorizontallyClamped = Math.abs(left - centeredLeft) > 0.01;

  const leftEdgeProgress = Math.min(
    1,
    Math.max(
      0,
      (SEEK_TOOLTIP_HORIZONTAL_PADDING + SEEK_TOOLTIP_EDGE_TRANSITION_DISTANCE - centeredLeft)
        / SEEK_TOOLTIP_EDGE_TRANSITION_DISTANCE,
    ),
  );
  const rightEdgeProgress = Math.min(
    1,
    Math.max(
      0,
      (centeredLeft - (maxLeft - SEEK_TOOLTIP_EDGE_TRANSITION_DISTANCE))
        / SEEK_TOOLTIP_EDGE_TRANSITION_DISTANCE,
    ),
  );
  const edgeProgress = Math.max(leftEdgeProgress, rightEdgeProgress);
  const nextProgressEdge = leftEdgeProgress >= rightEdgeProgress && leftEdgeProgress > 0
    ? "left"
    : rightEdgeProgress > 0
      ? "right"
      : null;

  const nextLeft = `${Math.round(left)}px`;
  const nextTop = `${Math.round(top)}px`;
  if (dom.tooltipLayer.style.left !== nextLeft) dom.tooltipLayer.style.left = nextLeft;
  if (dom.tooltipLayer.style.top !== nextTop) dom.tooltipLayer.style.top = nextTop;
  const nextPlacement = canShowAbove ? "top" : "bottom";
  if (seekTooltipState.placement !== nextPlacement) {
    seekTooltipState.placement = nextPlacement;
    dom.tooltipLayer.dataset.placement = nextPlacement;
  }
  const nextEdge = nextProgressEdge;
  if (seekTooltipState.edge !== nextEdge) {
    seekTooltipState.edge = nextEdge;
    if (nextEdge) {
      dom.tooltipLayer.dataset.edge = nextEdge;
    } else {
      dom.tooltipLayer.removeAttribute("data-edge");
    }
  }
  if (nextEdge) {
    const nextRadius = Math.round(
      (SEEK_TOOLTIP_DEFAULT_RADIUS
        - (SEEK_TOOLTIP_DEFAULT_RADIUS - SEEK_TOOLTIP_EDGE_RADIUS) * edgeProgress) * 10,
    ) / 10;
    if (seekTooltipState.edgeRadius !== nextRadius) {
      seekTooltipState.edgeRadius = nextRadius;
      dom.tooltipLayer.style.setProperty("--tooltip-edge-radius", `${nextRadius}px`);
    }
  } else if (seekTooltipState.edgeRadius !== null) {
    seekTooltipState.edgeRadius = null;
    dom.tooltipLayer.style.removeProperty("--tooltip-edge-radius");
  }
  if (isHorizontallyClamped) {
    const nextArrowOffset = Math.round(Math.min(
      Math.max(seekTooltipState.point.x - left, SEEK_TOOLTIP_ARROW_PADDING),
      Math.max(SEEK_TOOLTIP_ARROW_PADDING, tooltipWidth - SEEK_TOOLTIP_ARROW_PADDING),
    ));
    if (seekTooltipState.arrowOffset !== nextArrowOffset) {
      seekTooltipState.arrowOffset = nextArrowOffset;
      dom.tooltipLayer.style.setProperty("--tooltip-arrow-offset", `${nextArrowOffset}px`);
    }
  } else if (seekTooltipState.arrowOffset !== null) {
    seekTooltipState.arrowOffset = null;
    dom.tooltipLayer.style.removeProperty("--tooltip-arrow-offset");
  }
}

export function hideSeekTooltip() {
  seekTooltipState.point = null;
  seekTooltipState.rect = null;
  seekTooltipState.size = null;
  seekTooltipState.pendingPointer = null;
  window.cancelAnimationFrame(seekTooltipState.pointerFrame);
  seekTooltipState.pointerFrame = 0;
  window.cancelAnimationFrame(seekTooltipState.tooltipFrame);
  seekTooltipState.tooltipFrame = 0;

  if (!dom.tooltipLayer) return;
  dom.tooltipLayer.hidden = true;
  dom.tooltipLayer.style.visibility = "";
  if (seekTooltipState.arrowOffset !== null) {
    seekTooltipState.arrowOffset = null;
    dom.tooltipLayer.style.removeProperty("--tooltip-arrow-offset");
  }
  seekTooltipState.edge = null;
  seekTooltipState.edgeRadius = null;
  seekTooltipState.placement = null;
  dom.tooltipLayer.style.removeProperty("--tooltip-edge-radius");
  dom.tooltipLayer.removeAttribute("data-placement");
  dom.tooltipLayer.removeAttribute("data-edge");
}

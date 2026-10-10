import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const EMOJI_POPOVER_GAP_PX = 8;

const EMOJI_POPOVER_EDGE_PX = 8;

const EMOJI_POPOVER_BORDER_WIDTH_PX = 1;

const EMOJI_POPOVER_TAIL_INSET_PX = 20;

const EMOJI_POPOVER_TAIL_HEIGHT_PX = 8;

export const EMOJI_PAGE_COLUMNS = 7;

const EMOJI_PAGE_MAX_ROWS = 2;

const EMOJI_PAGE_MIN_CELL_PX = 20;

export function isLandscapeKeyboardEmojiLayout() {
  return Boolean(
    document.documentElement.classList.contains("viewport-landscape")
      && document.documentElement.classList.contains("bottom-chat-keyboard-open")
      && dom.sessionView?.dataset.chatDock === "bottom",
  );
}

function getEmojiViewportSize() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(0, viewport?.width || window.innerWidth || 0),
    height: Math.max(0, viewport?.height || window.innerHeight || 0),
  };
}

function getEmojiPopoverTrack(popover) {
  return popover.querySelector(".emoji-popover-track");
}

export function rebuildEmojiPopoverPages(popover, options, columns, rows) {
  const track = getEmojiPopoverTrack(popover);
  if (!track) return;

  const previousPage = track.clientWidth > 0
    ? Math.round(track.scrollLeft / track.clientWidth)
    : 0;
  const pageSize = Math.max(1, columns * rows);
  track.replaceChildren();

  for (let start = 0; start < options.length; start += pageSize) {
    const page = document.createElement("div");
    page.className = "emoji-popover-page";
    page.style.setProperty("--emoji-page-columns", String(columns));
    page.style.setProperty("--emoji-page-rows", String(rows));
    options.slice(start, start + pageSize).forEach((option) => page.append(option));
    track.append(page);
  }

  const nextPage = Math.min(
    Math.max(0, previousPage),
    Math.max(0, track.children.length - 1),
  );
  track.scrollLeft = nextPage * track.clientWidth;
}

export function syncEmojiPopoverLayout(popover) {
  const options = [...popover.querySelectorAll(".emoji-option")];
  if (!options.length) return;

  const landscapeKeyboardLayout = isLandscapeKeyboardEmojiLayout();
  const computedStyle = window.getComputedStyle(popover);
  const parsePixels = (value) => Number.parseFloat(value) || 0;
  const verticalChrome = parsePixels(computedStyle.paddingTop)
    + parsePixels(computedStyle.paddingBottom)
    + parsePixels(computedStyle.borderTopWidth)
    + parsePixels(computedStyle.borderBottomWidth);
  const rowGap = parsePixels(computedStyle.rowGap || computedStyle.gap);
  const { width: viewportWidth, height: viewportHeight } = getEmojiViewportSize();
  const availableWidth = Math.max(
    0,
    viewportWidth - EMOJI_POPOVER_EDGE_PX * 2,
  );
  const availableHeight = Math.max(
    0,
    viewportHeight
      - EMOJI_POPOVER_EDGE_PX * 2
      - EMOJI_POPOVER_TAIL_HEIGHT_PX,
  );

  if (landscapeKeyboardLayout) {
    popover.style.width = `${availableWidth}px`;
    popover.style.maxWidth = `${availableWidth}px`;
  } else {
    popover.style.removeProperty("width");
    popover.style.removeProperty("max-width");
  }

  popover.classList.remove("is-emoji-popover-paged");
  popover.style.removeProperty("height");
  rebuildEmojiPopoverPages(
    popover,
    options,
    EMOJI_PAGE_COLUMNS,
    Math.ceil(options.length / EMOJI_PAGE_COLUMNS),
  );

  const naturalHeight = popover.offsetHeight + EMOJI_POPOVER_TAIL_HEIGHT_PX;
  if (naturalHeight <= availableHeight) return;

  const optionRect = options[0].getBoundingClientRect();
  const naturalCellHeight = Math.max(EMOJI_PAGE_MIN_CELL_PX, optionRect.height);
  const rows = Math.max(
    1,
    Math.min(
      EMOJI_PAGE_MAX_ROWS,
      Math.floor(
        (availableHeight - verticalChrome + rowGap)
        / (naturalCellHeight + rowGap),
      ),
    ),
  );

  popover.classList.add("is-emoji-popover-paged");
  const compactHeight = verticalChrome
    + rows * naturalCellHeight
    + rowGap * Math.max(0, rows - 1);
  popover.style.height = `${Math.max(
    EMOJI_PAGE_MIN_CELL_PX + verticalChrome,
    Math.min(availableHeight, compactHeight),
  )}px`;
  rebuildEmojiPopoverPages(popover, options, EMOJI_PAGE_COLUMNS, rows);
}

export function positionEmojiPopover(popover, anchor) {
  syncEmojiPopoverLayout(popover);
  const { width: viewportWidth, height: viewportHeight } = getEmojiViewportSize();
  const anchorRect = anchor.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth;
  const popoverHeight = popover.offsetHeight;
  const popoverVisualHeight = popoverHeight + EMOJI_POPOVER_TAIL_HEIGHT_PX;
  const maxLeft = Math.max(
    EMOJI_POPOVER_EDGE_PX,
    viewportWidth - popoverWidth - EMOJI_POPOVER_EDGE_PX,
  );
  const left = Math.min(
    maxLeft,
    Math.max(EMOJI_POPOVER_EDGE_PX, anchorRect.left),
  );
  const spaceAbove = anchorRect.top - EMOJI_POPOVER_GAP_PX;
  const spaceBelow = viewportHeight - anchorRect.bottom - EMOJI_POPOVER_GAP_PX;
  const opensBelow = spaceAbove < popoverVisualHeight && spaceBelow > spaceAbove;
  const maxTop = Math.max(
    EMOJI_POPOVER_EDGE_PX,
    viewportHeight - popoverHeight - EMOJI_POPOVER_EDGE_PX,
  );
  const desiredTop = opensBelow
    ? anchorRect.bottom + EMOJI_POPOVER_GAP_PX + EMOJI_POPOVER_TAIL_HEIGHT_PX
    : anchorRect.top - popoverVisualHeight - EMOJI_POPOVER_GAP_PX;
  const top = Math.min(
    maxTop,
    Math.max(EMOJI_POPOVER_EDGE_PX, desiredTop),
  );
  const pathWidth = Math.max(0, popoverWidth - EMOJI_POPOVER_BORDER_WIDTH_PX);
  const rawAnchorOffset = anchorRect.left
    + anchorRect.width / 2
    - left
    - EMOJI_POPOVER_BORDER_WIDTH_PX / 2;
  const anchorOffset = Math.min(
    Math.max(EMOJI_POPOVER_TAIL_INSET_PX, pathWidth - EMOJI_POPOVER_TAIL_INSET_PX),
    Math.max(
      EMOJI_POPOVER_TAIL_INSET_PX,
      rawAnchorOffset,
    ),
  );

  popover.dataset.placement = opensBelow ? "bottom" : "top";
  popover.style.setProperty("--emoji-popover-anchor-x", `${anchorOffset}px`);
  const surface = popover.parentElement?.matches(".chat-area, .player-frame")
    ? popover.parentElement
    : null;
  if (surface) {
    const surfaceRect = surface.getBoundingClientRect();
    popover.style.position = "absolute";
    popover.style.top = `${top - surfaceRect.top}px`;
    popover.style.left = `${left - surfaceRect.left}px`;
  } else {
    popover.style.removeProperty("position");
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }
}

import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";
import { getDisplayName } from "../core/state.js?v=20261010-file-size-refactor-02";

const DESKTOP_BOTTOM_NAME_GAP_PX = 8;
const DESKTOP_BOTTOM_NAME_ARROW_GAP_PX = 120;
let nameInputMeasureCanvas = null;

function getNameInputMeasureContext() {
  if (!nameInputMeasureCanvas) {
    nameInputMeasureCanvas = document.createElement("canvas");
  }
  return nameInputMeasureCanvas.getContext("2d");
}

function buildCanvasFont(computedStyle) {
  const fontStyle = computedStyle.fontStyle || "normal";
  const fontVariant = computedStyle.fontVariant || "normal";
  const fontWeight = computedStyle.fontWeight || "400";
  const fontSize = computedStyle.fontSize || "16px";
  const lineHeight = computedStyle.lineHeight && computedStyle.lineHeight !== "normal"
    ? `/${computedStyle.lineHeight}`
    : "";
  const fontFamily = computedStyle.fontFamily || "sans-serif";
  return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}${lineHeight} ${fontFamily}`;
}

function getDesktopBottomNameGeometry() {
  const tools = dom.chatNameField?.closest(".chat-tools");
  const sessionView = tools?.closest(".session-view");
  const field = dom.chatNameField?.parentElement;
  const activeCollapseButton = sessionView.classList.contains("chat-collapsed")
    ? dom.expandChatButton
    : dom.collapseChatButton;
  const collapseAnchor = activeCollapseButton?.querySelector(".chat-collapse-icon-anchor");
  if (
    !tools
    || !sessionView
    || sessionView.dataset.chatDock !== "bottom"
    || !window.matchMedia("(min-width: 981px)").matches
    || !field
    || !collapseAnchor
    || !dom.presencePill
  ) return null;

  const toolsRect = tools.getBoundingClientRect();
  const presenceRect = dom.presencePill.getBoundingClientRect();
  const anchorRect = collapseAnchor.getBoundingClientRect();
  const computed = window.getComputedStyle(tools);
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const safeLeft = Math.max(
    toolsRect.left + paddingLeft,
    presenceRect.right + DESKTOP_BOTTOM_NAME_GAP_PX,
  );
  // La flecha queda centrada en el viewport; el nombre se ancla a su lado
  // izquierdo con un margen constante, independientemente de su ancho.
  const safeRight = anchorRect.left - DESKTOP_BOTTOM_NAME_ARROW_GAP_PX;

  // Durante el cambio de dock el control puede existir todavía con una
  // geometría transitoria. No congelamos esa medición como ancho del nombre.
  if (
    !Number.isFinite(safeLeft)
    || !Number.isFinite(safeRight)
    || presenceRect.width <= 0
    || anchorRect.width <= 0
    || safeRight <= safeLeft
  ) return null;

  return {
    field,
    safeRight,
    maxFieldWidth: safeRight - safeLeft,
  };
}

function syncDesktopBottomNameField(textWidth, isEditing) {
  const geometry = getDesktopBottomNameGeometry();
  if (!geometry) return null;

  const row = isEditing
    ? dom.nameInput?.closest(".chat-name-edit-row")
    : dom.nameDisplay?.closest(".chat-name-display-row");
  const button = isEditing ? dom.confirmNameButton : dom.editNameButton;
  const rowStyle = row ? window.getComputedStyle(row) : null;
  const rowGap = Number.parseFloat(rowStyle?.columnGap || rowStyle?.gap || "0") || 0;
  const buttonWidth = button?.getBoundingClientRect().width || 20;
  const maxFieldWidth = Math.max(0, geometry.maxFieldWidth);
  const naturalWidth = Math.ceil(textWidth + buttonWidth + rowGap);
  const targetWidth = Math.min(naturalWidth, maxFieldWidth);

  geometry.field.style.width = `${targetWidth}px`;
  geometry.field.style.maxWidth = `${maxFieldWidth}px`;
  geometry.field.style.transform = "none";
  const fieldRect = geometry.field.getBoundingClientRect();
  const horizontalShift = geometry.safeRight - fieldRect.right;
  if (Math.abs(horizontalShift) > 0.01) {
    geometry.field.style.transform = `translateX(${horizontalShift.toFixed(2)}px)`;
  }

  if (isEditing && button && row) {
    const rowRect = row.getBoundingClientRect();
    // La fila puede conservar una fracción de píxel distinta a la del
    // contenedor. Compensamos esa diferencia para que el botón coincida
    // siempre con el borde derecho anclado del campo.
    button.style.right = `${(rowRect.right - geometry.safeRight).toFixed(2)}px`;
  } else {
    button?.style.removeProperty("right");
  }

  return {
    inputMaxWidth: Math.max(0, maxFieldWidth - buttonWidth - rowGap),
  };
}

function getNameInputAvailableWidth() {
  const tools = dom.chatNameField?.closest(".chat-tools");
  if (!tools) return Number.POSITIVE_INFINITY;

  const sessionView = tools.closest(".session-view");
  if (
    sessionView?.dataset.chatDock === "bottom"
    && window.matchMedia("(min-width: 981px)").matches
  ) {
    const geometry = getDesktopBottomNameGeometry();
    const editRow = dom.nameInput?.closest(".chat-name-edit-row");
    const rowStyle = editRow ? window.getComputedStyle(editRow) : null;
    const rowGap = Number.parseFloat(rowStyle?.columnGap || rowStyle?.gap || "0") || 0;
    const confirmWidth = dom.confirmNameButton?.getBoundingClientRect().width || 20;
    if (geometry) {
      return Math.max(
        0,
        Math.floor(
          geometry.maxFieldWidth
          - confirmWidth
          - rowGap,
        ),
      );
    }
  }

  const computed = window.getComputedStyle(tools);
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
  const columnGap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
  const leftColumn = tools.children[0];
  const rightColumn = tools.children[2];
  const leftWidth = leftColumn ? Math.ceil(leftColumn.getBoundingClientRect().width) : 0;
  const rightWidth = rightColumn ? Math.ceil(rightColumn.getBoundingClientRect().width) : 0;
  const contentWidth = Math.max(0, Math.floor(tools.getBoundingClientRect().width - paddingLeft - paddingRight));

  // El editor vive en la columna central del grid; calculamos el ancho real
  // que le queda descontando las columnas laterales y los separadores.
  const availableWidth = contentWidth - leftWidth - rightWidth - (columnGap * 2);
  const editRow = dom.nameInput?.closest(".chat-name-edit-row");
  const rowStyle = editRow ? window.getComputedStyle(editRow) : null;
  const rowGap = Number.parseFloat(rowStyle?.columnGap || rowStyle?.gap || "0") || 0;
  const confirmWidth = dom.confirmNameButton?.getBoundingClientRect().width || 0;
  const nameInputWidth = availableWidth - confirmWidth - rowGap;

  return Math.max(0, Math.floor(nameInputWidth));
}

export function syncNameInputWidth() {
  if (!dom.nameInput || !dom.chatNameField) return;

  const input = dom.nameInput;
  const display = dom.nameDisplay;
  const computed = window.getComputedStyle(display || input);
  const context = getNameInputMeasureContext();

  if (context) {
    context.font = buildCanvasFont(computed);
    context.fontKerning = "normal";
  }

  const isEditing = dom.chatNameField.dataset.editing === "true";
  const text = input.value || (!isEditing ? getDisplayName() : "") || "";
  const measuredWidth = context ? context.measureText(text || " ").width : 24;
  const textWidth = Math.max(24, measuredWidth);
  const desktopLayout = syncDesktopBottomNameField(textWidth, isEditing);
  if (!desktopLayout) {
    const field = dom.chatNameField.parentElement;
    field?.style.removeProperty("width");
    field?.style.removeProperty("max-width");
    field?.style.removeProperty("transform");
    dom.confirmNameButton?.style.removeProperty("right");
  }
  const availableWidth = desktopLayout?.inputMaxWidth ?? getNameInputAvailableWidth();
  const maxWidth = availableWidth;
  const targetWidth = Math.min(textWidth, maxWidth);

  input.style.width = `${targetWidth}px`;
  input.style.maxWidth = `${maxWidth}px`;

  if (textWidth > maxWidth) {
    input.scrollLeft = input.scrollWidth;
  } else {
    input.scrollLeft = 0;
  }
}

import { dom } from "../../core/dom.js";

let pendingFrame = 0;

function syncNameHandleAlignment() {
  pendingFrame = 0;
  const sessionView = dom.sessionView;
  const chatArea = dom.chatArea;
  const nameField = dom.chatNameField;
  if (
    !sessionView
    || !chatArea
    || !nameField
    || sessionView.dataset.chatDock !== "bottom"
    || sessionView.classList.contains("chat-collapsed")
    || sessionView.classList.contains("chat-header-collapsed")
    || sessionView.classList.contains("chat-layout-transitioning")
  ) return;

  const rowSelector = nameField.dataset.editing === "true"
    ? ".chat-name-edit-row"
    : ".chat-name-display-row";
  const activeNameRow = nameField.querySelector(rowSelector);
  if (!activeNameRow) return;

  const rowRect = activeNameRow.getBoundingClientRect();
  const chatRect = chatArea.getBoundingClientRect();
  if (rowRect.height <= 0 || chatRect.height <= 0) return;

  const chatStyle = getComputedStyle(chatArea);
  const borderTop = Number.parseFloat(chatStyle.borderTopWidth) || 0;
  const handleTop = rowRect.top + rowRect.height / 2 - chatRect.top - borderTop;
  const normalizedTop = `${Math.round(handleTop * 100) / 100}px`;
  if (sessionView.style.getPropertyValue("--chat-bottom-dock-handle-top") !== normalizedTop) {
    sessionView.style.setProperty("--chat-bottom-dock-handle-top", normalizedTop);
  }
}

function scheduleNameHandleAlignment() {
  if (pendingFrame) return;
  pendingFrame = window.requestAnimationFrame(syncNameHandleAlignment);
}

if (dom.chatNameField && dom.chatArea) {
  const resizeObserver = new ResizeObserver(scheduleNameHandleAlignment);
  resizeObserver.observe(dom.chatNameField);
  resizeObserver.observe(dom.chatArea);

  const editingObserver = new MutationObserver(scheduleNameHandleAlignment);
  editingObserver.observe(dom.chatNameField, {
    attributes: true,
    attributeFilter: ["data-editing"],
  });

  dom.chatNameField.addEventListener("focusin", scheduleNameHandleAlignment);
  dom.chatNameField.addEventListener("focusout", scheduleNameHandleAlignment);
  window.addEventListener("resize", scheduleNameHandleAlignment, { passive: true });
  window.addEventListener("scroll", scheduleNameHandleAlignment, { passive: true });
  window.addEventListener("chat-layout-settled", scheduleNameHandleAlignment, { passive: true });
  scheduleNameHandleAlignment();
}

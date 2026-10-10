import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { state } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { EMOJI_PICKER_ITEMS, replaceEmojiShortcodes } from "../../core/utils.js?v=20261010-file-size-refactor-02";
import { focusChatInput } from "./chat-input-focus.js?v=20261010-file-size-refactor-02";
import { isMobileLayout, logMobileInteraction } from "./chat-input-debug.js?v=20261010-file-size-refactor-02";
import { EMOJI_PAGE_COLUMNS, isLandscapeKeyboardEmojiLayout, positionEmojiPopover, rebuildEmojiPopoverPages, syncEmojiPopoverLayout } from "./emoji-picker-layout.js?v=20261010-file-size-refactor-02";

const EMOJI_POPOVER_TRANSITION_MS = 150;

const EMOJI_FONT_SHORTHAND = '0.82rem "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji"';

const EMOJI_FONT_SAMPLE = "😂🫦❌👎✅👍🙏";

let emojiFontReady = null;

let emojiPopoverHideTimer = 0;

let emojiPickerOpenRequestId = 0;

let emojiPopoverOriginalParent = null;

function syncFullscreenEmojiPopoverSurface(anchor) {
  const popover = dom.emojiPopover;
  if (!popover || !isMobileLayout() || !document.body.classList.contains("fullscreen-mode")) {
    return;
  }

  if (!emojiPopoverOriginalParent) {
    emojiPopoverOriginalParent = popover.parentElement;
  }

  const surface = anchor?.closest(".chat-area, .player-frame")
    || dom.chatArea
    || dom.playerFrame;
  if (surface && popover.parentElement !== surface) {
    surface.append(popover);
  }
}

function restoreEmojiPopoverSurface() {
  const popover = dom.emojiPopover;
  if (
    popover
    && emojiPopoverOriginalParent
    && popover.parentElement !== emojiPopoverOriginalParent
  ) {
    emojiPopoverOriginalParent.append(popover);
  }
  popover?.style.removeProperty("position");
}

function preloadEmojiFont() {
  if (emojiFontReady) return emojiFontReady;
  if (!document.fonts?.load) return Promise.resolve();

  emojiFontReady = document.fonts
    .load(EMOJI_FONT_SHORTHAND, EMOJI_FONT_SAMPLE)
    .catch(() => undefined);
  return emojiFontReady;
}

export function repositionEmojiPicker() {
  const popover = dom.emojiPopover;
  if (!popover || popover.hidden || !popover.dataset.anchor) return;

  const anchor = document.getElementById(popover.dataset.anchor);
  if (!anchor) {
    hideEmojiPicker();
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  if (anchorRect.bottom < 0 || anchorRect.top > window.innerHeight) {
    // En escritorio el picker no debe depender del foco ni del estado
    // transitorio del composer: perder el foco puede sacar el ancla del
    // viewport mientras el layout se acomoda. En móvil conservamos el cierre
    // actual para no alterar el flujo del teclado virtual.
    if (isMobileLayout()) hideEmojiPicker();
    return;
  }

  positionEmojiPopover(popover, anchor);
}

function cancelEmojiPopoverHide() {
  if (!emojiPopoverHideTimer) return;
  window.clearTimeout(emojiPopoverHideTimer);
  emojiPopoverHideTimer = 0;
}

function showEmojiPopover(popover) {
  cancelEmojiPopoverHide();
  const track = getEmojiPopoverTrack(popover);
  if (track) track.scrollLeft = 0;
  popover.hidden = false;
  popover.classList.remove("is-emoji-popover-closing");
  window.requestAnimationFrame(() => {
    if (popover.hidden || popover.classList.contains("is-emoji-popover-closing")) return;
    popover.classList.add("is-emoji-popover-open");
  });
}

export function buildEmojiPicker() {
  void preloadEmojiFont();
  emojiPopoverOriginalParent = dom.emojiPopover.parentElement;
  dom.emojiPopover.innerHTML = "";
  const fog = document.createElement("span");
  fog.className = "emoji-popover-fog";
  fog.setAttribute("aria-hidden", "true");
  const track = document.createElement("div");
  track.className = "emoji-popover-track";
  const page = document.createElement("div");
  page.className = "emoji-popover-page";
  page.style.setProperty("--emoji-page-columns", String(EMOJI_PAGE_COLUMNS));
  track.append(page);
  dom.emojiPopover.append(fog);
  dom.emojiPopover.append(track);
  syncEmojiTriggerState();
  EMOJI_PICKER_ITEMS.forEach(({ emoji, tags }) => {
    const button = document.createElement("button");
    button.className = "emoji-option";
    button.type = "button";
    const tooltip = tags?.length ? `:${tags[0]}:` : "";
    button.setAttribute("aria-label", `Insertar ${emoji}`);
    if (tooltip) {
      button.dataset.tooltip = tooltip;
      button.removeAttribute("title");
    }
    button.textContent = emoji;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      insertEmoji(emoji);
    });
    page.append(button);
  });
}

export async function toggleEmojiPicker(input, anchor) {
  logMobileInteraction("emoji:toggle-start", input, {
    anchor: anchor?.id || null,
    anchorFocused: document.activeElement === anchor,
    anchorRect: anchor ? (() => { const rect = anchor.getBoundingClientRect(); return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }; })() : null,
  });
  state.ui.activeEmojiInput = input;
  if (!dom.emojiPopover.hidden && dom.emojiPopover.dataset.anchor === anchor.id) {
    hideEmojiPicker();
    logMobileInteraction("emoji:toggle-close", input, { anchor: anchor.id });
    return;
  }

  const selectionStart = input?.selectionStart ?? input?.value.length ?? 0;
  const selectionEnd = input?.selectionEnd ?? input?.value.length ?? 0;
  const openRequestId = ++emojiPickerOpenRequestId;
  await preloadEmojiFont();
  if (openRequestId !== emojiPickerOpenRequestId) return;

  syncFullscreenEmojiPopoverSurface(anchor);
  dom.emojiPopover.dataset.anchor = anchor.id;
  showEmojiPopover(dom.emojiPopover);
  positionEmojiPopover(dom.emojiPopover, anchor);
  logMobileInteraction("emoji:opened-before-focus-restore", input, { anchor: anchor.id });

  syncEmojiTriggerState(anchor);

  window.requestAnimationFrame(() => {
    if (openRequestId !== emojiPickerOpenRequestId || dom.emojiPopover.hidden) return;
    if (isMobileLayout()) return;
    focusChatInput(input, selectionStart, selectionEnd);
    logMobileInteraction("emoji:after-focus-restore", input, { anchor: anchor.id });
  });
}

function syncEmojiTriggerState(activeAnchor = null) {
  [dom.messageEmojiButton, dom.overlayEmojiButton].forEach((button) => {
    if (!button) return;
    const isActive = button === activeAnchor;
    button.classList.toggle("is-emoji-picker-open", isActive);
    button.setAttribute("aria-expanded", String(isActive));
  });
}

export function hideEmojiPicker() {
  const popover = dom.emojiPopover;
  emojiPickerOpenRequestId += 1;
  if (popover.hidden) {
    popover.classList.remove("is-emoji-popover-open", "is-emoji-popover-closing");
    popover.dataset.anchor = "";
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    restoreEmojiPopoverSurface();
    syncEmojiTriggerState();
    return;
  }

  if (popover.classList.contains("is-emoji-popover-closing")) return;
  cancelEmojiPopoverHide();
  popover.classList.remove("is-emoji-popover-open");
  popover.classList.add("is-emoji-popover-closing");
  dom.emojiPopover.dataset.anchor = "";
  syncEmojiTriggerState();
  emojiPopoverHideTimer = window.setTimeout(() => {
    emojiPopoverHideTimer = 0;
    popover.hidden = true;
    popover.classList.remove("is-emoji-popover-closing");
    popover.dataset.placement = "";
    popover.style.removeProperty("--emoji-popover-anchor-x");
    restoreEmojiPopoverSurface();
  }, EMOJI_POPOVER_TRANSITION_MS);
}

export function normalizeEmojiShortcodesInput(input) {
  if (!input) return false;

  const originalValue = input.value;
  if (!originalValue.includes(":")) return false;

  const selectionStart = input.selectionStart ?? originalValue.length;
  const selectionEnd = input.selectionEnd ?? originalValue.length;
  const nextValue = replaceEmojiShortcodes(originalValue);
  if (nextValue === originalValue) return false;

  input.value = nextValue;

  if (typeof input.setSelectionRange === "function") {
    const nextStart = replaceEmojiShortcodes(originalValue.slice(0, selectionStart)).length;
    const nextEnd = replaceEmojiShortcodes(originalValue.slice(0, selectionEnd)).length;
    input.setSelectionRange(nextStart, nextEnd);
  }

  return true;
}

function insertEmoji(emoji) {
  if (!state.ui.activeEmojiInput) return;
  const input = state.ui.activeEmojiInput;
  logMobileInteraction("emoji:insert-start", input, { emoji, activeEmojiInput: input.id || null });
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const nextPosition = start + emoji.length;
  if (isMobileLayout()) {
    input.setSelectionRange?.(nextPosition, nextPosition);
  } else {
    focusChatInput(input, nextPosition, nextPosition);
  }
  hideEmojiPicker();
  logMobileInteraction("emoji:insert-after-focus", input, {
    emoji,
    nextPosition,
    inputFocused: document.activeElement === input,
  });
}

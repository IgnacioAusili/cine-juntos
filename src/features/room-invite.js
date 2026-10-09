import { dom } from "../core/dom.js";
import { state } from "../core/state.js?v=20261008";
import { setSyncStatus } from "./session-ui.js?v=20261008";
import { sanitizeRoomInput } from "./room-input.js?v=20261008";

let inviteCopyFeedbackTimer = 0;
let inviteCopyAnimationTimer = 0;
let inviteCopyAnimationEndTarget = null;
let inviteCopyAnimationEndHandler = null;

function clearInviteCopyAnimationEndListener() {
  if (inviteCopyAnimationEndTarget && inviteCopyAnimationEndHandler) {
    inviteCopyAnimationEndTarget.removeEventListener("animationend", inviteCopyAnimationEndHandler);
  }
  inviteCopyAnimationEndTarget = null;
  inviteCopyAnimationEndHandler = null;
}

export async function copyInvite() {
  const roomFromUrl = sanitizeRoomInput(new URL(window.location.href).searchParams.get("room"));
  const roomCode = state.session.activeRoom || roomFromUrl;
  if (!roomCode || dom.sessionView?.hidden) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }
  const invite = new URL(window.location.href);
  invite.searchParams.set("room", roomCode);
  if (!await copyTextToClipboard(invite.toString())) return;
  setInviteCopyFeedback(true);
  setSyncStatus("Invitacion copiada.");
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Chrome Android puede rechazar Clipboard API tras una transición de foco.
  }

  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.setAttribute("aria-hidden", "true");
  Object.assign(fallbackInput.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(fallbackInput);
  fallbackInput.focus({ preventScroll: true });
  fallbackInput.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  fallbackInput.remove();
  return copied;
}

export function setInviteCopyFeedback(active) {
  if (!dom.copyInviteButton) return;
  window.clearTimeout(inviteCopyFeedbackTimer);
  window.clearTimeout(inviteCopyAnimationTimer);
  clearInviteCopyAnimationEndListener();
  dom.copyInviteButton.dataset.copied = active ? "true" : "false";
  dom.copyInviteButton.classList.remove("is-copy-animating");
  if (!active) return;

  void dom.copyInviteButton.offsetWidth;
  dom.copyInviteButton.classList.add("is-copy-animating");
  const animationTarget = dom.copyInviteButton.querySelector(
    ".room-chip-copy-motion, .room-chip-copy-main",
  );
  const finishCopyAnimation = (event) => {
    if (event.animationName !== "roomChipCopyLift") return;
    clearInviteCopyAnimationEndListener();
    window.clearTimeout(inviteCopyAnimationTimer);
    inviteCopyAnimationTimer = 0;
    dom.copyInviteButton?.classList.remove("is-copy-animating");
  };

  if (animationTarget) {
    inviteCopyAnimationEndTarget = animationTarget;
    inviteCopyAnimationEndHandler = finishCopyAnimation;
    animationTarget.addEventListener("animationend", finishCopyAnimation);
  }

  const animationDurationMs = animationTarget
    ? Number.parseFloat(getComputedStyle(animationTarget).animationDuration) * 1000
    : 0;
  const fallbackDelayMs = Number.isFinite(animationDurationMs) && animationDurationMs > 0
    ? animationDurationMs + 120
    : 1200;
  inviteCopyAnimationTimer = window.setTimeout(() => {
    clearInviteCopyAnimationEndListener();
    dom.copyInviteButton?.classList.remove("is-copy-animating");
    inviteCopyAnimationTimer = 0;
  }, fallbackDelayMs);
  inviteCopyFeedbackTimer = window.setTimeout(() => {
    if (dom.copyInviteButton) dom.copyInviteButton.dataset.copied = "false";
  }, 1500);
}

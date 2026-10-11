import { animateExpandedSystemMessageRemoval, captureExpandedSystemMessageRemoval, prepareSystemMessageRemoval, refreshSystemMessageGroup, scheduleSystemMessageCollapse } from "./system-message-groups.js?v=20261011-chat-interaction-fixes-01";

const SYSTEM_MESSAGE_STREAK_LIMIT = 10;
const SYSTEM_MESSAGE_EXIT_MS = 380;

export function getTrailingSystemStreak(container) {
  const children = Array.from(container.children).filter((child) => child.classList.contains("message"));
  let streakStart = children.length;

  while (streakStart > 0 && children[streakStart - 1].classList.contains("system")) {
    streakStart -= 1;
  }

  return children.slice(streakStart);
}

export async function makeRoomForSystemMessage(container, { animateSystemGroups = true } = {}) {
  while (getTrailingSystemStreak(container).length >= SYSTEM_MESSAGE_STREAK_LIMIT) {
    await removeOldestSystemMessage(container, { animateSystemGroups });
  }
}

export function removeOldestSystemMessage(container, { animateSystemGroups = true } = {}) {
  const streak = getTrailingSystemStreak(container);
  const oldest = streak[0];
  if (!oldest) return Promise.resolve();

  const wasNearBottom = !document.hidden
    && container.scrollHeight - container.scrollTop - container.clientHeight <= 120;
  const groupHeader = prepareSystemMessageRemoval(container, oldest, { deferReanchor: true });
  const expandedRemoval = groupHeader?.getAttribute("aria-expanded") === "true";

  if (!animateSystemGroups) {
    prepareSystemMessageRemoval(container, oldest);
    oldest.remove();
    refreshSystemMessageGroup(groupHeader);
    scheduleSystemMessageCollapse(container);
    if (wasNearBottom && !document.hidden) container.scrollTop = container.scrollHeight;
    return Promise.resolve();
  }

  oldest.classList.add("message-system-exit");
  if (expandedRemoval) oldest.classList.add("message-system-exit-expanded");

  return new Promise((resolve) => {
    let removalFinished = false;
    const exitTarget = expandedRemoval
      ? oldest.querySelector(".message-system-bubble")
      : null;
    let fallbackTimer = 0;

    const finishRemoval = () => {
      if (removalFinished) return;
      removalFinished = true;
      if (exitTarget) exitTarget.removeEventListener("animationend", handleExitAnimationEnd);
      window.clearTimeout(fallbackTimer);

      // Reanclar y retirar en la misma tarea evita que el selector se pinte
      // una fila más abajo antes de que el resto del grupo suba.
      prepareSystemMessageRemoval(container, oldest);
      const removalVisualState = expandedRemoval
        ? captureExpandedSystemMessageRemoval(oldest, groupHeader)
        : null;
      oldest.remove();
      refreshSystemMessageGroup(groupHeader);
      scheduleSystemMessageCollapse(container);
      animateExpandedSystemMessageRemoval(removalVisualState);
      if (wasNearBottom && !document.hidden) container.scrollTop = container.scrollHeight;
      window.requestAnimationFrame(resolve);
    };

    const handleExitAnimationEnd = (event) => {
      if (event.animationName !== "systemMessageExitExpandedBubble") return;
      finishRemoval();
    };

    if (exitTarget) {
      exitTarget.addEventListener("animationend", handleExitAnimationEnd);
      fallbackTimer = window.setTimeout(finishRemoval, SYSTEM_MESSAGE_EXIT_MS + 50);
    } else {
      fallbackTimer = window.setTimeout(finishRemoval, SYSTEM_MESSAGE_EXIT_MS);
    }
  });
}

const messageInput = document.getElementById("messageInput");
const inputWrapper = messageInput?.closest(".input-wrapper");
const chatArea = messageInput?.closest(".chat-area");
const sessionView = messageInput?.closest(".session-view");

if (messageInput && inputWrapper && chatArea && sessionView) {
  const LAYOUT_MOTION_CLASSES = [
    "chat-dock-handle-switching",
    "chat-dock-mobile-transition-out",
    "chat-dock-mobile-transition-out-active",
    "chat-dock-mobile-transition-in",
    "chat-dock-mobile-transition-in-active",
    "chat-dock-switching",
    "chat-dock-switching-entered",
    "chat-layout-transitioning",
    "chat-bottom-collapse-visual",
    "chat-bottom-expand-visual",
    "chat-bottom-mobile-collapse-visual",
    "chat-bottom-mobile-expand-visual",
    "chat-bottom-mobile-curtain-active",
    "chat-bottom-pc-collapse-visual",
    "chat-bottom-pc-expand-visual",
    "chat-bottom-curtain-active",
  ];
  const SETTLE_DELAY_MS = 280;
  let measureTimer = 0;

  function isLayoutMoving() {
    return LAYOUT_MOTION_CLASSES.some((className) =>
      sessionView.classList.contains(className),
    );
  }

  function shouldSkipMeasure() {
    return isLayoutMoving()
      || sessionView.classList.contains("chat-collapsed")
      || sessionView.dataset.chatDock !== "bottom";
  }

  function syncCenteredPadding() {
    measureTimer = 0;
    if (shouldSkipMeasure()) return;

    const style = getComputedStyle(messageInput);
    const inputRect = messageInput.getBoundingClientRect();
    const lineHeight = Number.parseFloat(style.lineHeight);
    const minHeight = Number.parseFloat(style.minHeight);
    const borderBlock =
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);

    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      messageInput.style.removeProperty("--message-input-centered-padding");
      return;
    }

    const paddingBlock =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const measuredLineCount =
      (messageInput.scrollHeight - paddingBlock) / lineHeight;
    const hasMultipleLines =
      inputWrapper.dataset.expanded === "true" ||
      messageInput.value.includes("\n") ||
      measuredLineCount > 1.5;
    const renderedHeight = inputRect.height || minHeight;
    const singleLineHeight =
      hasMultipleLines && minHeight > 0
        ? Math.min(renderedHeight, minHeight)
        : renderedHeight;

    if (!Number.isFinite(singleLineHeight) || singleLineHeight <= 0) return;

    const padding = Math.max(
      0,
      (singleLineHeight - borderBlock - lineHeight) / 2,
    );
    const nextValue = padding.toFixed(3) + "px";

    if (
      messageInput.style.getPropertyValue("--message-input-centered-padding") !==
      nextValue
    ) {
      messageInput.style.setProperty(
        "--message-input-centered-padding",
        nextValue,
      );
    }
  }

  function scheduleMeasure() {
    if (shouldSkipMeasure()) {
      if (measureTimer) window.clearTimeout(measureTimer);
      measureTimer = 0;
      return;
    }

    if (measureTimer) window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(syncCenteredPadding, SETTLE_DELAY_MS);
  }

  const resizeObserver = new ResizeObserver(scheduleMeasure);
  resizeObserver.observe(messageInput);
  resizeObserver.observe(inputWrapper);
  resizeObserver.observe(chatArea);

  const expansionObserver = new MutationObserver(scheduleMeasure);
  expansionObserver.observe(inputWrapper, {
    attributes: true,
    attributeFilter: ["data-expanded"],
  });

  const layoutStateObserver = new MutationObserver(scheduleMeasure);
  layoutStateObserver.observe(sessionView, {
    attributes: true,
    attributeFilter: ["class", "data-chat-dock"],
  });

  window.addEventListener("resize", scheduleMeasure, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleMeasure, {
    passive: true,
  });
  messageInput.addEventListener("input", scheduleMeasure);
  document.fonts?.ready.then(scheduleMeasure);
  document.fonts?.addEventListener("loadingdone", scheduleMeasure);

  if (!shouldSkipMeasure()) scheduleMeasure();
}

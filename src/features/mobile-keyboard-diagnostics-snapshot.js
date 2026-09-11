import { dom } from "../core/dom.js";

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function rectOf(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: round(rect.x), y: round(rect.y), top: round(rect.top),
    right: round(rect.right), bottom: round(rect.bottom),
    width: round(rect.width), height: round(rect.height),
  };
}

function styleOf(element) {
  if (!element) return null;
  const style = getComputedStyle(element);
  return {
    position: style.position,
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    top: style.top,
    right: style.right,
    bottom: style.bottom,
    left: style.left,
    height: style.height,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    transform: style.transform,
    overflow: style.overflow,
    overflowY: style.overflowY,
    gridTemplateRows: style.gridTemplateRows,
    paddingBottom: style.paddingBottom,
    marginBottom: style.marginBottom,
  };
}

function safeAreaBottom() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:-9999px;bottom:0;width:1px;height:0;"
    + "padding-bottom:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden";
  document.body.append(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return value;
}

function environmentSnapshot() {
  const orientation = screen.orientation;
  const metaViewport = document.querySelector('meta[name="viewport"]');
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: Boolean(window.navigator.standalone),
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      orientation: orientation?.type || null,
      angle: orientation?.angle ?? null,
    },
    devicePixelRatio: window.devicePixelRatio,
    safeAreaBottom: safeAreaBottom(),
    metaViewport: metaViewport?.content || null,
    cssSupports: {
      visualViewport: Boolean(window.visualViewport),
      virtualKeyboard: Boolean(navigator.virtualKeyboard),
      dynamicViewportUnits: CSS.supports?.("height: 100dvh") || false,
      resizeObserver: Boolean(window.ResizeObserver),
    },
  };
}

function elementSnapshot(element) {
  return {
    rect: rectOf(element),
    style: styleOf(element),
    scroll: element
      ? {
        top: round(element.scrollTop),
        height: round(element.scrollHeight),
        clientHeight: round(element.clientHeight),
      }
      : null,
  };
}

function inputSnapshot(input) {
  if (!input) return null;
  return {
    id: input.id,
    focused: document.activeElement === input,
    valueLength: input.value.length,
    selection: { start: input.selectionStart, end: input.selectionEnd },
    disabled: input.disabled,
    readOnly: input.readOnly,
    element: elementSnapshot(input),
  };
}

function composerSnapshot(form, input) {
  return {
    form: elementSnapshot(form),
    input: inputSnapshot(input),
    textareaShell: elementSnapshot(form?.querySelector(".textarea-shell")),
    inputWrapper: elementSnapshot(form?.querySelector(".input-wrapper")),
    sendButton: elementSnapshot(form?.querySelector("button[type=submit]")),
  };
}

export function collectMobileKeyboardSnapshot(reason, sequence) {
  const viewport = window.visualViewport;
  const vv = viewport
    ? {
      width: round(viewport.width),
      height: round(viewport.height),
      offsetLeft: round(viewport.offsetLeft),
      offsetTop: round(viewport.offsetTop),
      pageLeft: round(viewport.pageLeft),
      pageTop: round(viewport.pageTop),
      scale: round(viewport.scale),
      bottom: round(viewport.offsetTop + viewport.height),
    }
    : null;
  const viewportBottom = vv?.bottom ?? window.innerHeight;
  const activeInput = [dom.messageInput, dom.overlayMessageInput]
    .find((input) => input && document.activeElement === input) || dom.messageInput;
  const activeForm = activeInput === dom.overlayMessageInput
    ? dom.overlayMessageForm
    : dom.messageForm;
  const formRect = activeForm?.getBoundingClientRect();
  const inputRect = activeInput?.getBoundingClientRect();
  const rootStyle = getComputedStyle(document.documentElement);
  const rootClasses = document.documentElement.classList;
  const rightLandscape = rootClasses.contains("viewport-landscape")
    && dom.sessionView?.dataset.chatDock === "right";
  return {
    sequence,
    reason,
    at: new Date().toISOString(),
    environment: sequence === 1 ? environmentSnapshot() : undefined,
    scenario: {
      target: "ios-landscape-right-chat",
      rightLandscape,
      viewportLandscapeClass: rootClasses.contains("viewport-landscape"),
      chatDock: dom.sessionView?.dataset.chatDock || null,
      rightKeyboardClass: rootClasses.contains("right-chat-keyboard-open"),
      inputFocused: document.activeElement === dom.messageInput,
    },
    activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    page: {
      scrollX: round(window.scrollX), scrollY: round(window.scrollY),
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      outerWidth: window.outerWidth, outerHeight: window.outerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
    },
    viewport: vv,
    estimatedKeyboard: vv && vv.height < window.innerHeight - 80
      ? { top: viewportBottom, height: round(window.innerHeight - viewportBottom) }
      : null,
    root: {
      className: document.documentElement.className,
      cssVars: {
        appWidth: rootStyle.getPropertyValue("--app-viewport-width").trim(),
        appHeight: rootStyle.getPropertyValue("--app-viewport-height").trim(),
        visibleHeight: rootStyle.getPropertyValue("--right-chat-visible-height").trim(),
      },
    },
    session: {
      hidden: dom.sessionView?.hidden ?? null,
      className: dom.sessionView?.className || null,
      fullscreen: Boolean(document.fullscreenElement || document.body.classList.contains("fullscreen-mode")),
    },
    geometry: {
      session: elementSnapshot(dom.sessionView),
      workspace: elementSnapshot(dom.workspace),
      videoArea: elementSnapshot(dom.videoArea),
      chatArea: elementSnapshot(dom.chatArea),
      chatTools: elementSnapshot(dom.chatArea?.querySelector(".chat-tools")),
      messages: elementSnapshot(dom.messages),
      mainComposer: composerSnapshot(dom.messageForm, dom.messageInput),
      overlayComposer: composerSnapshot(dom.overlayMessageForm, dom.overlayMessageInput),
    },
    visibility: {
      activeComposer: activeForm?.id || null,
      formBottomToVisualViewport: formRect ? round(viewportBottom - formRect.bottom) : null,
      inputBottomToVisualViewport: inputRect ? round(viewportBottom - inputRect.bottom) : null,
      formBottomToInnerHeight: formRect ? round(window.innerHeight - formRect.bottom) : null,
      inputBottomToInnerHeight: inputRect ? round(window.innerHeight - inputRect.bottom) : null,
    },
  };
}

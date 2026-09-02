// Snapshots geometricos usados por el diagnostico temporal del chat.
import { dom } from "../../core/dom.js";
import { state, logEvent } from "../../core/state.js";

const DEBUG_QUERY = "layoutDebug";

export function isLayoutDebugEnabled() {
  return Boolean(
    state.session.terminalLogsEnabled
      || window.CINE_JUNTOS_LAYOUT_DEBUG
      || new URLSearchParams(window.location.search).get(DEBUG_QUERY) === "1",
  );
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

export function debugTargetName(target) {
  if (target === window) return "window";
  if (target === document) return "document";
  if (!target) return "none";
  if (target.id) return `#${target.id}`;
  return target.className && typeof target.className === "string"
    ? `.${target.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
    : target.tagName || "unknown";
}

function rectOf(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: round(rect.x),
    y: round(rect.y),
    top: round(rect.top),
    right: round(rect.right),
    bottom: round(rect.bottom),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function getScrollSnapshot() {
  const scrollingElement = document.scrollingElement;
  const shell = dom.sessionView?.closest(".app-shell");
  return {
    windowY: round(window.scrollY || 0),
    documentY: round(scrollingElement?.scrollTop || 0),
    documentMax: round(Math.max(
      0,
      (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0),
    )),
    shellY: round(shell?.scrollTop || 0),
    shellMax: round(Math.max(0, (shell?.scrollHeight || 0) - (shell?.clientHeight || 0))),
  };
}

export function getLayoutSnapshot() {
  const root = document.documentElement;
  const session = dom.sessionView;
  const workspace = dom.workspace;
  const workspaceStyle = workspace ? getComputedStyle(workspace) : null;
  const sessionStyle = session ? getComputedStyle(session) : null;
  const viewport = window.visualViewport;
  const rootStyle = getComputedStyle(root);

  return {
    viewport: {
      innerWidth: round(window.innerWidth),
      innerHeight: round(window.innerHeight),
      clientWidth: round(root.clientWidth),
      clientHeight: round(root.clientHeight),
      visualWidth: round(viewport?.width),
      visualHeight: round(viewport?.height),
      visualOffsetLeft: round(viewport?.offsetLeft),
      visualOffsetTop: round(viewport?.offsetTop),
      devicePixelRatio: round(window.devicePixelRatio),
      orientation: screen.orientation?.type || null,
    },
    scroll: getScrollSnapshot(),
    classes: {
      html: root.className,
      body: document.body.className,
      session: session?.className || "",
    },
    cssVars: {
      appWidth: rootStyle.getPropertyValue("--app-viewport-width").trim(),
      appHeight: rootStyle.getPropertyValue("--app-viewport-height").trim(),
      appOffsetTop: rootStyle.getPropertyValue("--app-viewport-offset-top").trim(),
      toolbarHeight: rootStyle.getPropertyValue("--session-toolbar-height").trim(),
      handleTop: sessionStyle?.getPropertyValue("--chat-right-mobile-handle-top").trim(),
      collapsedHandleTop: sessionStyle
        ?.getPropertyValue("--chat-right-mobile-collapsed-handle-top")
        .trim(),
    },
    grid: workspaceStyle
      ? {
        columns: workspaceStyle.gridTemplateColumns,
        rows: workspaceStyle.gridTemplateRows,
        width: workspaceStyle.width,
        height: workspaceStyle.height,
        minHeight: workspaceStyle.minHeight,
        overflow: workspaceStyle.overflow,
      }
      : null,
    computed: sessionStyle
      ? {
        sessionHeight: sessionStyle.height,
        sessionMinHeight: sessionStyle.minHeight,
        sessionOverflow: sessionStyle.overflow,
        playerFrameHeight: getComputedStyle(dom.playerFrame || document.body).height,
      }
      : null,
    rects: {
      session: rectOf(session),
      workspace: rectOf(workspace),
      videoArea: rectOf(dom.videoArea),
      playerFrame: rectOf(dom.playerFrame),
      video: rectOf(dom.videoPlayer),
      chatArea: rectOf(dom.chatArea),
      chatHandle: rectOf(dom.collapseChatButton),
      sessionToolbar: rectOf(dom.sessionToolbar),
    },
    activeElement: debugTargetName(document.activeElement),
  };
}

export function emitLayoutDebug(sequenceId, sequenceStartedAt, label, data = {}, includeLayout = true) {
  if (!isLayoutDebugEnabled()) return;
  const payload = {
    seq: sequenceId,
    dtMs: Math.round((performance.now() - sequenceStartedAt) * 10) / 10,
    label,
    ...data,
  };
  if (includeLayout) payload.layout = getLayoutSnapshot();
  logEvent("layout-debug", JSON.stringify(payload));
}

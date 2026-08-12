import { dom } from "../core/dom.js";

let syncFrameId = 0;
let toolbarObserver = null;
let interactionState = null;

function getLayoutSnapshot() {
  const viewport = window.visualViewport;

  return {
    scrollY: Math.round(window.scrollY || 0),
    innerHeight: Math.round(window.innerHeight || 0),
    visualViewportHeight: Math.round(viewport?.height || 0),
    visualViewportOffsetTop: Math.round(viewport?.offsetTop || 0),
    bodyScrollHeight: Math.round(document.body?.scrollHeight || 0),
    bodyClientHeight: Math.round(document.body?.clientHeight || 0),
    docScrollHeight: Math.round(document.documentElement?.scrollHeight || 0),
    docClientHeight: Math.round(document.documentElement?.clientHeight || 0),
    appViewportHeightVar: getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-height").trim(),
    bodyClass: document.body.className,
    lobbyHidden: Boolean(dom.lobbyScreen?.hidden),
    sessionHidden: Boolean(dom.sessionView?.hidden),
  };
}

function logLayoutMetrics(reason) {
  console.info("[layout-metrics]", reason, getLayoutSnapshot());
}

function getInteractionTargetLabel(target) {
  if (!(target instanceof Element)) return "unknown";
  const id = target.id ? `#${target.id}` : "";
  const className = target.classList?.length ? `.${[...target.classList].join(".")}` : "";
  return `${target.tagName.toLowerCase()}${id}${className}`;
}

function logInteraction(eventName, event, extra = {}) {
  console.info("[lobby-input]", eventName, {
    type: event.type,
    pointerType: "pointerType" in event ? event.pointerType : undefined,
    buttons: "buttons" in event ? event.buttons : undefined,
    clientX: Math.round(extra.clientX ?? event.clientX ?? 0),
    clientY: Math.round(extra.clientY ?? event.clientY ?? 0),
    target: getInteractionTargetLabel(event.target),
    scrollY: Math.round(window.scrollY || 0),
    innerHeight: Math.round(window.innerHeight || 0),
    visualViewportHeight: Math.round(window.visualViewport?.height || 0),
    bodyClass: document.body.className,
    ...extra,
  });
}

function getPrimaryPoint(event) {
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0];
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : { clientX: 0, clientY: 0 };
  }

  return {
    clientX: event.clientX || 0,
    clientY: event.clientY || 0,
  };
}

function startInteractionTracking(event) {
  const point = getPrimaryPoint(event);
  interactionState = {
    pointerType: "pointerType" in event ? event.pointerType : event.type.startsWith("touch") ? "touch" : "mouse",
    startX: Math.round(point.clientX || 0),
    startY: Math.round(point.clientY || 0),
    target: getInteractionTargetLabel(event.target),
    dragLogged: false,
  };
  logInteraction("down", event, {
    startX: interactionState.startX,
    startY: interactionState.startY,
  });
}

function updateInteractionTracking(event) {
  if (!interactionState) return;

  const point = getPrimaryPoint(event);
  const currentX = Math.round(point.clientX || 0);
  const currentY = Math.round(point.clientY || 0);
  const deltaX = currentX - interactionState.startX;
  const deltaY = currentY - interactionState.startY;
  const distance = Math.round(Math.hypot(deltaX, deltaY));

  if (!interactionState.dragLogged && distance >= 8) {
    interactionState.dragLogged = true;
    logInteraction("drag-start", event, {
      deltaX,
      deltaY,
      distance,
      startTarget: interactionState.target,
    });
  } else if (interactionState.dragLogged) {
    logInteraction("drag-move", event, {
      deltaX,
      deltaY,
      distance,
      startTarget: interactionState.target,
    });
  }
}

function endInteractionTracking(event) {
  if (!interactionState) return;

  logInteraction("up", event, {
    dragged: interactionState.dragLogged,
    startTarget: interactionState.target,
  });
  interactionState = null;
}

function wireInteractionLogs() {
  if ("PointerEvent" in window) {
    window.addEventListener("pointerdown", startInteractionTracking, { passive: true });
    window.addEventListener("pointermove", updateInteractionTracking, { passive: true });
    window.addEventListener("pointerup", endInteractionTracking, { passive: true });
    window.addEventListener("pointercancel", endInteractionTracking, { passive: true });
    return;
  }

  window.addEventListener("touchstart", startInteractionTracking, { passive: true });
  window.addEventListener("touchmove", updateInteractionTracking, { passive: true });
  window.addEventListener("touchend", endInteractionTracking, { passive: true });
  window.addEventListener("touchcancel", endInteractionTracking, { passive: true });
  window.addEventListener("mousedown", startInteractionTracking, { passive: true });
  window.addEventListener("mousemove", updateInteractionTracking, { passive: true });
  window.addEventListener("mouseup", endInteractionTracking, { passive: true });
}

function getViewportHeight() {
  return Math.round(
    window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      0,
  );
}

function syncViewportHeight() {
  document.documentElement.style.setProperty("--app-viewport-height", `${getViewportHeight()}px`);
}

function syncSessionToolbarHeight() {
  const height = Math.round(dom.sessionToolbar?.getBoundingClientRect().height || 0);
  document.documentElement.style.setProperty("--session-toolbar-height", `${height}px`);
}

function syncLayoutMetrics() {
  syncViewportHeight();
  syncSessionToolbarHeight();
}

function scheduleLayoutMetricsSync(reason = "scheduled") {
  if (syncFrameId) return;

  syncFrameId = window.requestAnimationFrame(() => {
    syncFrameId = 0;
    syncLayoutMetrics();
    logLayoutMetrics(reason);
  });
}

export function wireLayoutMetrics() {
  syncLayoutMetrics();
  logLayoutMetrics("wireLayoutMetrics");
  wireInteractionLogs();

  window.addEventListener("resize", () => scheduleLayoutMetricsSync("window.resize"), {
    passive: true,
  });
  window.addEventListener("orientationchange", () => scheduleLayoutMetricsSync("orientationchange"), {
    passive: true,
  });
  window.visualViewport?.addEventListener(
    "resize",
    () => scheduleLayoutMetricsSync("visualViewport.resize"),
    { passive: true },
  );

  if ("ResizeObserver" in window && dom.sessionToolbar) {
    toolbarObserver?.disconnect?.();
    toolbarObserver = new ResizeObserver(() => scheduleLayoutMetricsSync("sessionToolbar.resize"));
    toolbarObserver.observe(dom.sessionToolbar);
  }
}

export function refreshLayoutMetrics() {
  syncLayoutMetrics();
  logLayoutMetrics("refreshLayoutMetrics");
}

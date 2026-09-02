// Wiring temporal para diagnosticar saltos de viewport al contraer el chat.
import { dom } from "../../core/dom.js";
import {
  debugTargetName,
  emitLayoutDebug,
  isLayoutDebugEnabled,
} from "./chat-layout-debug-snapshot.js?v=20260902-chat-layout-debug-01";

const SEQUENCE_TTL_MS = 1800;
const SNAPSHOT_DELAYS_MS = [0, 80, 300, 700, 1400];

let sequenceId = 0;
let sequenceStartedAt = 0;
let sequenceTimers = [];
let frameSnapshotId = 0;

function clearSequenceTimers() {
  sequenceTimers.forEach((timerId) => window.clearTimeout(timerId));
  sequenceTimers = [];
  if (frameSnapshotId) {
    window.cancelAnimationFrame(frameSnapshotId);
    frameSnapshotId = 0;
  }
}

function scheduleSnapshots(label) {
  SNAPSHOT_DELAYS_MS.forEach((delay) => {
    const timerId = window.setTimeout(() => {
      emitLayoutDebug(sequenceId, sequenceStartedAt, `${label}:t+${delay}ms`);
    }, delay);
    sequenceTimers.push(timerId);
  });
}

function startSequence(label, data = {}) {
  if (!isLayoutDebugEnabled()) return;
  clearSequenceTimers();
  sequenceId += 1;
  sequenceStartedAt = performance.now();
  emitLayoutDebug(sequenceId, sequenceStartedAt, label, data);
  scheduleSnapshots(label);
}

function continueSequence(label, data = {}) {
  if (!isLayoutDebugEnabled()) return;
  if (!sequenceStartedAt || performance.now() - sequenceStartedAt > SEQUENCE_TTL_MS) {
    startSequence(label, data);
    return;
  }
  emitLayoutDebug(sequenceId, sequenceStartedAt, label, data);
}

function scheduleFrameSnapshot(label, data = {}) {
  if (!isLayoutDebugEnabled() || !sequenceStartedAt || frameSnapshotId) return;
  frameSnapshotId = window.requestAnimationFrame(() => {
    frameSnapshotId = 0;
    if (performance.now() - sequenceStartedAt <= SEQUENCE_TTL_MS) {
      emitLayoutDebug(sequenceId, sequenceStartedAt, label, data);
    }
  });
}

function wireTransientEvents() {
  const onScroll = (event) => {
    if (!sequenceStartedAt || performance.now() - sequenceStartedAt > SEQUENCE_TTL_MS) return;
    emitLayoutDebug(sequenceId, sequenceStartedAt, "scroll-event", {
      target: debugTargetName(event.target),
    }, false);
    scheduleFrameSnapshot("scroll-event:next-frame");
  };
  const onResize = (event) => {
    if (!sequenceStartedAt || performance.now() - sequenceStartedAt > SEQUENCE_TTL_MS) return;
    emitLayoutDebug(sequenceId, sequenceStartedAt, event.type, {
      target: debugTargetName(event.target),
    }, false);
    scheduleFrameSnapshot(`${event.type}:next-frame`);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });
  window.visualViewport?.addEventListener("resize", onResize, { passive: true });
  window.visualViewport?.addEventListener("scroll", onResize, { passive: true });
  document.addEventListener("focusin", (event) => {
    if (!sequenceStartedAt || performance.now() - sequenceStartedAt > SEQUENCE_TTL_MS) return;
    emitLayoutDebug(sequenceId, sequenceStartedAt, "focusin", {
      target: debugTargetName(event.target),
    });
  }, { passive: true });
  window.addEventListener("chat-layout-settled", () => {
    continueSequence("chat-layout-settled");
  }, { passive: true });
}

export function wireChatLayoutDebug() {
  if (!dom.sessionView || !dom.collapseChatButton) return;

  let lastCollapsed = dom.sessionView.classList.contains("chat-collapsed");
  dom.collapseChatButton.addEventListener("pointerdown", (event) => {
    startSequence("collapse:pointerdown", {
      pointerType: event.pointerType || null,
      defaultPrevented: event.defaultPrevented,
      collapsedBefore: lastCollapsed,
    });
  }, { capture: true, passive: true });
  dom.collapseChatButton.addEventListener("click", () => {
    continueSequence("collapse:click-after", {
      collapsedAfterClick: dom.sessionView.classList.contains("chat-collapsed"),
    });
  }, { passive: true });

  const mutationObserver = new MutationObserver((records) => {
    if (!records.some((record) => record.attributeName === "class")) return;
    const collapsed = dom.sessionView.classList.contains("chat-collapsed");
    const changed = collapsed !== lastCollapsed;
    lastCollapsed = collapsed;
    if (changed) continueSequence("session-class-change", { collapsed });
  });
  mutationObserver.observe(dom.sessionView, { attributes: true, attributeFilter: ["class"] });

  if (typeof ResizeObserver === "function") {
    const observed = new Map([
      [dom.workspace, "workspace"],
      [dom.videoArea, "videoArea"],
      [dom.playerFrame, "playerFrame"],
      [dom.chatArea, "chatArea"],
    ]);
    const layoutObserver = new ResizeObserver((entries) => {
      if (!sequenceStartedAt || performance.now() - sequenceStartedAt > SEQUENCE_TTL_MS) return;
      emitLayoutDebug(sequenceId, sequenceStartedAt, "resize-observer", {
        entries: entries.map((entry) => observed.get(entry.target) || debugTargetName(entry.target)),
      });
    });
    observed.forEach((name, element) => {
      if (element) layoutObserver.observe(element);
    });
  }

  wireTransientEvents();
}

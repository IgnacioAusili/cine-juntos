import { dom } from "../../core/dom.js";
import {
  getMirrorChatDraft,
  handleMiniChatInteraction,
  isOverlayEmojiButton,
  isOverlayMessageInput,
  isOverlayMessageSubmit,
  restoreMirrorChatDraft,
  submitMirrorChat,
  syncMirroredChatMessages,
  toggleMiniEmojiPicker,
  toggleMiniChatOverlay,
  wireMirrorChatScrollbar,
} from "./mini-player-chat-mirror.js?v=20260808-scroll-mini-player-02";
import { wireMiniPlayerShortcuts } from "./mini-player-shortcuts.js?v=20260808-scroll-mini-player-02";

const VIDEO_EVENTS = ["play", "pause", "timeupdate", "seeked", "ratechange", "volumechange"];
const PROXY_CONTROL_SELECTOR = "button, input, select, textarea";

export function movePlayerInterface(surface) {
  const videoAnchor = document.createComment("mini-player-video-origin");
  dom.videoPlayer.parentNode?.insertBefore(videoAnchor, dom.videoPlayer);
  surface.append(dom.videoPlayer);

  const mirrors = [
    dom.playerActions,
    dom.playerBottomActions,
    dom.resumeVideoPopup,
    dom.playerChat,
  ].filter(Boolean).map((source) => createInteractiveMirror(source, surface.ownerDocument));
  mirrors.forEach(({ element }) => surface.append(element));
  const removeShortcuts = wireMiniPlayerShortcuts(surface.ownerDocument, surface);

  const syncMirrors = () => mirrors
    .filter(({ source }) => source !== dom.playerChat)
    .forEach(({ syncState }) => syncState());
  VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, syncMirrors));

  return {
    restore() {
      VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, syncMirrors));
      mirrors.forEach(({ restore }) => restore());
      removeShortcuts();
      videoAnchor.parentNode?.insertBefore(dom.videoPlayer, videoAnchor);
      videoAnchor.remove();
    },
  };
}

function createInteractiveMirror(source, targetDocument) {
  const keepIds = targetDocument !== source.ownerDocument;
  const element = targetDocument.importNode(source, true);
  const observer = new MutationObserver((records) => {
    if (source === dom.playerChat) {
      if (records.some((record) => record.target.closest?.(".overlay-messages"))) {
        syncMirroredChatMessages(source, element);
      }
      return;
    }
    if (source === dom.playerBottomActions) {
      syncState();
      return;
    }
    sync();
  });
  let isSyncing = false;

  element.addEventListener("click", (event) => {
    if (event.target.matches?.("input, select, textarea")) return;
    const target = getSourceControl(source, event.target);
    if (!target || target.disabled) return;
    event.preventDefault();
    if (target.id === "playerChatToggleButton") {
      toggleMiniChatOverlay(element.closest(".mini-player-surface"));
      return;
    }
    if (isOverlayEmojiButton(source, target)) {
      toggleMiniEmojiPicker(element);
      return;
    }
    if (isOverlayMessageSubmit(source, target)) {
      submitMirrorChat(source, element);
      return;
    }
    if (source === dom.playerChat) {
      handleMiniChatInteraction(element, event.target);
      return;
    }
    target.click();
    requestAnimationFrame(sync);
  });

  element.addEventListener("submit", (event) => {
    if (source !== dom.playerChat) return;
    event.preventDefault();
    submitMirrorChat(source, element);
  });

  ["input", "change"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      const target = getSourceControl(source, event.target);
      if (!target) return;
      if (isOverlayMessageInput(source, target)) return;
      target.value = event.target.value;
      target.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName === "change") sync();
    });
  });

  element.addEventListener("wheel", (event) => {
    if (source !== dom.playerBottomActions) return;
    const volumeGroup = event.target?.closest?.(".player-volume-group");
    if (!volumeGroup || !element.contains(volumeGroup)) return;

    event.preventDefault();
    event.stopPropagation();
    const step = 0.05;
    const delta = event.deltaY < 0 ? step : -step;
    const nextVolume = Math.min(1, Math.max(0, dom.videoPlayer.volume + delta));
    dom.videoPlayer.volume = nextVolume;
    if (nextVolume > 0 && dom.videoPlayer.muted) dom.videoPlayer.muted = false;
    syncState();
  }, { passive: false });

  observer.observe(source, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  sync();

  return {
    element,
    source,
    sync,
    syncState,
    restore() {
      observer.disconnect();
      element.remove();
    },
  };

  function sync() {
    if (isSyncing || isRangeBeingDragged(element)) return;
    isSyncing = true;
    const draft = getMirrorChatDraft(source, element);
    element.className = source.className;
    element.innerHTML = source.innerHTML;
    markProxyControls(element, keepIds);
    copyControlState(source, element);
    restoreMirrorChatDraft(source, element, draft);
    wireMirrorChatScrollbar(element);
    isSyncing = false;
  }

  function syncState() {
    copyControlState(source, element);
    copyPlayerTimeLabels(source, element);
    if (source === dom.playerBottomActions) copyDynamicButtonPresentation(source, element);
  }
}

function markProxyControls(element, keepIds) {
  element.querySelectorAll(PROXY_CONTROL_SELECTOR).forEach((control, index) => {
    control.dataset.proxyIndex = String(index);
    if (keepIds || !control.id) return;
    control.dataset.proxyFor = control.id;
    control.removeAttribute("id");
  });
  if (!keepIds) element.querySelectorAll("[for]").forEach((label) => label.removeAttribute("for"));
}

function copyControlState(source, element) {
  source.querySelectorAll(PROXY_CONTROL_SELECTOR).forEach((sourceControl, index) => {
    const proxy = element.querySelector(`[data-proxy-index="${index}"]`);
    if (!proxy) return;
    proxy.disabled = sourceControl.disabled;
    proxy.value = sourceControl.value;
    proxy.checked = sourceControl.checked;
    proxy.style.cssText = sourceControl.style.cssText;
    proxy.setAttribute("aria-label", sourceControl.getAttribute("aria-label") || "");
    proxy.dataset.tooltip = sourceControl.dataset.tooltip || "";
  });
}

function copyPlayerTimeLabels(source, element) {
  ["playerCurrentTime", "playerDuration"].forEach((id) => {
    const sourceLabel = source.querySelector(`#${id}`);
    const mirrorLabel = element.querySelector(`#${id}, [data-proxy-for="${id}"]`);
    if (sourceLabel && mirrorLabel) mirrorLabel.textContent = sourceLabel.textContent;
  });
}

function copyDynamicButtonPresentation(source, element) {
  ["playerPlayButton", "playerMuteButton", "playerMiniPlayerButton"].forEach((id) => {
    const sourceButton = source.querySelector(`#${id}`);
    const mirrorButton = element.querySelector(`[data-proxy-for="${id}"]`);
    if (!sourceButton || !mirrorButton) return;
    mirrorButton.className = sourceButton.className;
    mirrorButton.innerHTML = sourceButton.innerHTML;
    mirrorButton.setAttribute("aria-label", sourceButton.getAttribute("aria-label") || "");
    mirrorButton.dataset.tooltip = sourceButton.dataset.tooltip || "";
  });
}

function getSourceControl(source, target) {
  if (!target?.closest) return null;
  const proxy = target.closest("[data-proxy-index]");
  if (!proxy) return null;
  return source.querySelectorAll(PROXY_CONTROL_SELECTOR)[Number(proxy.dataset.proxyIndex)] || null;
}

function isRangeBeingDragged(element) {
  const activeElement = element.ownerDocument.activeElement;
  return activeElement?.matches?.('input[type="range"]')
    && element.contains(activeElement);
}

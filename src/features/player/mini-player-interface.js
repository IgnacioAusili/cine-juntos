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
  positionMiniSystemToggles,
  syncMiniChatAutoExpand,
  wireMiniMessageReplies,
  toggleMiniEmojiPicker,
  toggleMiniChatOverlay,
  wireMirrorChatScrollbar,
} from "./mini-player-chat-mirror.js?v=20260812-mini-chat-fixes-04";
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
  // Los espejos se sincronizan una primera vez antes de insertarse. Repetir
  // el de acciones después de anexarlo permite aplicar el estado propio del
  // mini reproductor al botón de chat (sin copiar el estado del principal).
  mirrors
    .filter(({ source }) => source === dom.playerActions)
    .forEach(({ sync }) => sync());
  const playerChatMirror = mirrors.find(({ source }) => source === dom.playerChat)?.element;
  const handleMiniAutoExpandControl = (event) => {
    const target = event.target.closest?.(
      "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
    );
    if (!target || !playerChatMirror?.contains(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleMiniChatInteraction(playerChatMirror, target);
  };
  playerChatMirror?.addEventListener("click", handleMiniAutoExpandControl, true);
  const handleMiniAutoExpandClick = (event) => {
    // El espejo delegado suele resolverlo antes de que el evento llegue a la
    // superficie; en ese caso no volver a invertir el switch por segunda vez.
    if (event.defaultPrevented) return;
    const target = event.target.closest?.(
      "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
    );
    if (!target || !playerChatMirror?.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    handleMiniChatInteraction(playerChatMirror, target);
  };
  surface.addEventListener("click", handleMiniAutoExpandClick, true);
  const removeShortcuts = wireMiniPlayerShortcuts(surface.ownerDocument, surface);

  const syncMirrors = () => mirrors
    .filter(({ source }) => source !== dom.playerChat)
    .forEach(({ syncState }) => syncState());
  VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.addEventListener(eventName, syncMirrors));

  return {
    restore() {
      VIDEO_EVENTS.forEach((eventName) => dom.videoPlayer.removeEventListener(eventName, syncMirrors));
      mirrors.forEach(({ restore }) => restore());
      playerChatMirror?.removeEventListener("click", handleMiniAutoExpandControl, true);
      surface.removeEventListener("click", handleMiniAutoExpandClick, true);
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
      } else if (records.some((record) => record.target.closest?.(".overlay-message-form"))) {
        syncMirrorComposerState(source, element);
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

  // El overlay del mini reproductor es una superficie independiente. Se
  // clona al abrirse, pero no vuelve a copiar cambios del reproductor normal.
  const observesSource = true;

  element.addEventListener("click", (event) => {
    if (event.target.matches?.("input, select, textarea")) return;
    const autoExpandTarget = event.target.closest?.(
      "#insideChatAutoExpandSwitch, [data-proxy-for=\"insideChatAutoExpandSwitch\"]",
    );
    if (autoExpandTarget) {
      event.preventDefault();
      event.stopPropagation();
      handleMiniChatInteraction(element, autoExpandTarget);
      return;
    }
    if (source === dom.playerChat && event.target.closest?.(".system-group-toggle")) {
      const mirrorToggle = event.target.closest(".system-group-toggle");
      const expanded = mirrorToggle.getAttribute("aria-expanded") !== "true";
      mirrorToggle.setAttribute("aria-expanded", String(expanded));
      const systemItems = [...element.querySelectorAll(".overlay-messages .message.system")];
      systemItems.forEach((item, index) => {
        item.classList.toggle("system-group-collapsed-item", !expanded && index < systemItems.length - 1);
      });
      positionMiniSystemToggles(element);
      return;
    }
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
    if (source === dom.playerBottomActions && event.target.closest?.(".player-volume-group")) {
      event.target.closest(".player-volume-group").classList.add("volume-hovered");
    }
    target.click();
    requestAnimationFrame(() => {
      if (source === dom.playerBottomActions) syncState();
      else sync();
    });
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
      if (isOverlayMessageInput(source, target)) {
        target.value = event.target.value;
        target.dispatchEvent(new Event(eventName, { bubbles: true }));
        return;
      }
      target.value = event.target.value;
      target.dispatchEvent(new Event(eventName, { bubbles: true }));
      if (eventName === "change") {
        if (source === dom.playerBottomActions) syncState();
        else sync();
      }
    });
  });

  element.addEventListener("pointerout", (event) => {
    if (source !== dom.playerBottomActions) return;
    const volumeGroup = event.target.closest?.(".player-volume-group");
    if (!volumeGroup || volumeGroup.contains(event.relatedTarget)) return;
    volumeGroup.classList.remove("volume-hovered");
  }, { passive: true });

  element.addEventListener("wheel", (event) => {
    if (source !== dom.playerBottomActions) return;
    const volumeGroup = event.target?.closest?.(".player-volume-group");
    if (!volumeGroup || !element.contains(volumeGroup)) return;

    event.preventDefault();
    event.stopPropagation();
    const step = 0.05;
    const delta = event.deltaY < 0 ? step : -step;
    const currentVolume = dom.videoPlayer.muted ? 0 : dom.videoPlayer.volume;
    const nextVolume = Math.min(1, Math.max(0, currentVolume + delta));
    volumeGroup.classList.add("volume-hovered");
    dom.videoPlayer.volume = nextVolume;
    if (nextVolume > 0 && dom.videoPlayer.muted) dom.videoPlayer.muted = false;
    syncState();
  }, { passive: false });

  if (observesSource) {
    observer.observe(source, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
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
    if (source === dom.playerBottomActions) copyDynamicButtonPresentation(source, element);
    if (source === dom.playerActions) {
      const surface = element.closest(".mini-player-surface");
      if (surface) {
        toggleMiniChatOverlay(surface, surface.classList.contains("chat-inside-open"));
      }
    }
    restoreMirrorChatDraft(source, element, draft);
    wireMirrorChatScrollbar(element);
    if (source === dom.playerChat) {
      const sourceMessages = source.querySelector(".overlay-messages");
      const mirrorMessages = element.querySelector(".overlay-messages");
      if (sourceMessages && mirrorMessages) wireMiniMessageReplies(sourceMessages, mirrorMessages, element);
      syncMiniChatAutoExpand(element.closest(".mini-player-surface"));
    }
    if (source === dom.playerChat) positionMiniSystemToggles(element);
    isSyncing = false;
  }

  function syncState() {
    copyControlState(source, element);
    copyPlayerTimeLabels(source, element);
    if (source === dom.playerBottomActions) copyDynamicButtonPresentation(source, element);
  }
}

function syncMirrorComposerState(source, element) {
  const sourceWrapper = source.querySelector(".overlay-message-form .input-wrapper");
  const mirrorWrapper = element.querySelector(".overlay-message-form .input-wrapper");
  const sourceInput = source.querySelector("#overlayMessageInput");
  const mirrorInput = element.querySelector("#overlayMessageInput, [data-proxy-for=\"overlayMessageInput\"]");
  if (!sourceWrapper || !mirrorWrapper) return;

  mirrorWrapper.dataset.expanded = sourceWrapper.dataset.expanded || "false";
  if (sourceInput && mirrorInput && mirrorInput !== element.ownerDocument.activeElement) {
    mirrorInput.style.cssText = sourceInput.style.cssText;
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
    const mirrorButton = element.querySelector(`#${id}, [data-proxy-for="${id}"]`);
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

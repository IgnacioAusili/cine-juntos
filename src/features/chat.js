// Coordinacion general del chat: cableado de eventos, layout y reexport de submodulos.
import {
  dom,
} from "../core/dom.js";
import {
  state,
  logEvent,
} from "../core/state.js";
import {
  CHAT_DOCKS,
  CHAT_DOCK_META,
} from "../core/utils.js";
import {
  hydrateIcons,
} from "./ui.js";
import { focusFullscreenWorkspace } from "./session-ui.js";
import {
  autoResizeMessageInput,
  handlePasteEvent,
  hideEmojiPicker,
  submitMessageFrom,
  toggleEmojiPicker,
  updateCharCounter,
} from "./chat-input.js";
import {
  setReplyTarget,
} from "./chat-render.js";
import {
  checkScrollPosition,
  resetExternalUnread,
  resetInsideUnread,
} from "./unread-counters.js";
import {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./chat-message-interactions.js";

export {
  buildEmojiPicker,
  updateCharCounter,
  sendMessage,
} from "./chat-input.js";
export {
  clearReplyTarget,
  renderMessage,
  renderReplyPreview,
  scrollToMessage,
  sendVideoEventMessage,
  setReplyTarget,
} from "./chat-render.js";
export {
  checkScrollPosition,
  resetExternalUnread,
  resetInsideUnread,
} from "./unread-counters.js";
export {
  copyMessageText,
  hideMessageMenu,
  showMessageMenu,
} from "./chat-message-interactions.js";

export function wireChatEvents() {
  dom.chatStyleToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-style]");
    if (!button) return;
    setInsideChatStyle(button.dataset.chatStyle);
  });

  dom.playerChatToggleButton.addEventListener("click", () => {
    setInsideChatVisible(!dom.playerFrame.classList.contains("chat-inside-open"));
  });

  dom.closeInsideChatButton.addEventListener("click", () => {
    setInsideChatVisible(false);
  });

  dom.dockChatButton.addEventListener("click", () => {
    const currentDock = dom.sessionView.dataset.chatDock || "right";
    setChatDock(CHAT_DOCK_META[currentDock]?.next || "right");
  });

  dom.collapseChatButton.addEventListener("click", () => {
    setExternalChatCollapsed(!dom.sessionView.classList.contains("chat-collapsed"));
  });

  dom.messageEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.messageInput, dom.messageEmojiButton);
  });

  dom.overlayEmojiButton.addEventListener("click", () => {
    toggleEmojiPicker(dom.overlayMessageInput, dom.overlayEmojiButton);
  });

  document.addEventListener("click", (event) => {
    if (dom.emojiPopover.hidden) return;
    if (dom.emojiPopover.contains(event.target)) return;
    if (event.target.closest(".emoji-trigger")) return;
    hideEmojiPicker();
  });

  document.addEventListener("click", (event) => {
    if (dom.messageMenu.hidden) return;
    if (Date.now() - state.chat.messageMenuOpenedAt < 220) return;
    if (dom.messageMenu.contains(event.target)) return;
    hideMessageMenu();
  });

  dom.messageMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action || !state.chat.menuMessage) return;
    if (action === "copy") copyMessageText(state.chat.menuMessage);
    if (action === "reply") setReplyTarget(state.chat.menuMessage);
    hideMessageMenu();
  });

  dom.messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.messageInput);
  });

  dom.overlayMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessageFrom(dom.overlayMessageInput);
  });

  [dom.messageInput, dom.overlayMessageInput].forEach((input) => {
    const isOverlay = input === dom.overlayMessageInput;
    input.addEventListener("input", () => {
      autoResizeMessageInput(input);
      updateCharCounter(input, isOverlay);
    });
    input.addEventListener("paste", () => window.setTimeout(() => {
      autoResizeMessageInput(input);
      updateCharCounter(input, isOverlay);
    }, 0));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessageFrom(input);
      }
    });
  });

  dom.messageInput.addEventListener("paste", (event) => handlePasteEvent(event, false));
  dom.overlayMessageInput.addEventListener("paste", (event) => handlePasteEvent(event, true));

  dom.mainScrollBottomBtn.addEventListener("click", () => {
    dom.messages.scrollTo({ top: dom.messages.scrollHeight, behavior: "smooth" });
    checkScrollPosition(false);
  });
  dom.overlayScrollBottomBtn.addEventListener("click", () => {
    dom.overlayMessages.scrollTo({ top: dom.overlayMessages.scrollHeight, behavior: "smooth" });
    checkScrollPosition(true);
  });

  dom.messages.addEventListener("scroll", () => checkScrollPosition(false), { passive: true });
  dom.overlayMessages.addEventListener("scroll", () => checkScrollPosition(true), { passive: true });

  dom.overlayMessages.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: true },
  );
}

export function setInsideChatVisible(visible) {
  dom.playerFrame.classList.toggle("chat-inside-open", visible);
  dom.playerChatToggleButton.classList.toggle("active", visible);
  dom.playerChatToggleButton.setAttribute("aria-pressed", String(visible));

  if (visible) {
    dom.overlayMessages.scrollTop = dom.overlayMessages.scrollHeight;
    resetInsideUnread();
  }
  logEvent("ui", visible ? "Chat interno visible." : "Chat interno oculto.");
}

export function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
  logEvent("ui", `Estilo de chat interno: ${nextStyle}.`);
}

export function setChatDock(dock) {
  const nextDock = CHAT_DOCKS.includes(dock) ? dock : "right";
  const meta = CHAT_DOCK_META[nextDock];
  const icon = dom.dockChatButton.querySelector("[data-lucide]");

  dom.sessionView.dataset.chatDock = nextDock;
  dom.dockChatButton.dataset.tooltip = meta.tooltip;
  dom.dockChatButton.removeAttribute("title");
  dom.dockChatButton.setAttribute("aria-label", `Chat ${meta.label}. ${meta.tooltip}`);
  if (icon) {
    const nextMeta = CHAT_DOCK_META[meta.next];
    icon.setAttribute("data-lucide", nextMeta.icon);
    icon.innerHTML = "";
  }
  localStorage.setItem("cine-juntos-chat-dock", nextDock);
  hydrateIcons();
  updateCollapseButton();
  logEvent("ui", `Chat lateral en posicion: ${meta.label}.`);

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
}

export function setExternalChatCollapsed(collapsed) {
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  if (!collapsed) resetExternalUnread();
  updateCollapseButton();
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
}

export function updateCollapseButton() {
  const collapsed = dom.sessionView.classList.contains("chat-collapsed");
  const dock = dom.sessionView.dataset.chatDock || "right";
  const icon = dom.collapseChatButton.querySelector("[data-lucide]");
  const iconName =
    dock === "right"
      ? collapsed
        ? "chevron-left"
        : "chevron-right"
      : collapsed
        ? "chevron-up"
        : "chevron-down";
  const label = collapsed ? "Expandir chat" : "Contraer chat";

  dom.collapseChatButton.dataset.tooltip = label;
  dom.collapseChatButton.removeAttribute("title");
  dom.collapseChatButton.setAttribute("aria-label", label);
  if (icon) {
    icon.setAttribute("data-lucide", iconName);
    icon.innerHTML = "";
  }
  hydrateIcons();
}

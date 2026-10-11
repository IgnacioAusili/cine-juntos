import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";
import { makeRoomForSystemMessage } from "./chat-system-message-retention.js?v=20261011-chat-interaction-fixes-01";
import { getRenderableMessageImages } from "./chat-message-media.js?v=20261010-file-size-refactor-02";
import { state, logEvent } from "../../core/state.js?v=20261010-file-size-refactor-02";
import { markParticipantActive, rememberParticipant } from "../presence.js?v=20261011-chat-ui-fixes-03";
import { scheduleMessageTimeAdjustmentForBubble } from "./message-time-layout.js?v=20261010-file-size-refactor-02";
import {
  handleIncomingUnread,
  handleIncomingPageUnread,
} from "./unread-counters.js?v=20261011-chat-interaction-fixes-01";
import { setExternalChatCollapsed, setInsideChatVisible } from "./chat-layout.js?v=20261011-chat-ui-fixes-03";
import { appendMessageNow } from "./chat-message-render-item.js?v=20261011-overlay-scroll-top-01";

const SYSTEM_GROUP_MESSAGE_FRESHNESS_MS = 3000;
const SYSTEM_GROUP_RESUME_GRACE_MS = 250;
const messageRenderQueues = new WeakMap();
let systemMessageResumeAt = 0;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  systemMessageResumeAt = state.session.transport?.now?.() ?? Date.now();
});

export function beginSystemMessageHydration() {
  finishSystemMessageHydration();
  state.chat.systemGroupAnimationSuppressed = true;
}

export function finishSystemMessageHydration() {
  state.chat.systemGroupAnimationSuppressed = false;
}

/**
 * Renderiza un mensaje en los contenedores de chat.
 */
export function renderMessage(message, options = {}) {
  const isHistory = Boolean(options.isHistory);
  const prepend = Boolean(options.prepend);
  const requestedSystemGroupAnimation = options.animateSystemGroups
    ?? message?.animateSystemGroups
    ?? (message?.videoEvent?.action === "video-ready" ? false : null)
    ?? true;
  const animateSystemGroups = requestedSystemGroupAnimation
    && !state.chat.systemGroupAnimationSuppressed
    && canAnimateSystemMessage(message);
  const messageText = String(message?.text || "").trim();
  const messageImages = getRenderableMessageImages(message, messageText);
  if (
    (!messageText && !message?.image && !messageImages.length) ||
    state.chat.lastMessageIds.has(message.id)
  )
    return;
  state.chat.lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);
  markParticipantActive(message.from, message.name);

  const mainItem = appendMessageTo(dom.messages, message, { animateSystemGroups, prepend });
  const overlayItem = appendMessageTo(dom.overlayMessages, message, { animateSystemGroups, prepend });

  if (message.from !== state.session.clientId && !isHistory) {
    handleIncomingUnread({ setInsideChatVisible, setExternalChatCollapsed });
    handleIncomingPageUnread();
  }
  Promise.resolve(mainItem).then((item) => {
    scheduleMessageTimeAdjustmentForBubble(item?.querySelector(".message-bubble"));
  });
  Promise.resolve(overlayItem).then((item) => {
    scheduleMessageTimeAdjustmentForBubble(item?.querySelector(".message-bubble"));
  });
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
  return Promise.all([mainItem, overlayItem]);
}

function canAnimateSystemMessage(message) {
  if (!message?.system) return true;
  if (document.visibilityState !== "visible") return false;

  const serverTime = message.serverTime == null ? Number.NaN : Number(message.serverTime);
  const createdAt = message.createdAt == null ? Number.NaN : Number(message.createdAt);
  const messageTime = Number.isFinite(serverTime) ? serverTime : createdAt;
  const now = state.session.transport?.now?.() ?? Date.now();
  if (systemMessageResumeAt && now <= systemMessageResumeAt + SYSTEM_GROUP_RESUME_GRACE_MS) return false;
  if (!Number.isFinite(messageTime)) {
    return !systemMessageResumeAt || now - systemMessageResumeAt > SYSTEM_GROUP_MESSAGE_FRESHNESS_MS;
  }
  if (now - messageTime > SYSTEM_GROUP_MESSAGE_FRESHNESS_MS) return false;
  return !systemMessageResumeAt || messageTime > systemMessageResumeAt + SYSTEM_GROUP_RESUME_GRACE_MS;
}

/**
 * Crea y añade el elemento DOM del mensaje al contenedor.
 */
function appendMessageTo(container, message, options = {}) {
  const previousTask = messageRenderQueues.get(container);
  if (!message.system && !previousTask) return appendMessageNow(container, message, options);

  const task = (previousTask || Promise.resolve())
    .catch(() => null)
    .then(async () => {
      if (message.system) await makeRoomForSystemMessage(container, options);
      return appendMessageNow(container, message, options);
    });
  messageRenderQueues.set(container, task);
  return task;
}

import { MAX_ROOM_PARTICIPANTS } from "../core/utils.js";
import { state, getDisplayName, logEvent } from "../core/state.js";

export function createLocalTransport(roomCode, firebaseError = null) {
  const channelName = `cine-juntos:${roomCode}`;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
  const storageKey = `${channelName}:event`;
  const memberKey = `${channelName}:member:${state.session.clientId}`;
  let handlers = {};
  let heartbeat = null;
  let messageHandler = null;
  let storageHandler = null;
  let localMembers = readLocalMembers(roomCode);

  const renderLocalMembers = () => {
    handlers.onMembers?.(localMembers);
  };

  const publishLocalMember = (requestRoster) => {
    const member = postLocalMember(channel, storageKey, memberKey, requestRoster);
    localMembers[member.id] = member;
    renderLocalMembers();
  };

  const receive = (packet) => {
    if (!packet || packet.from === state.session.clientId) return;
    if (packet.kind === "state") handlers.onState?.(packet.payload);
    if (packet.kind === "message") handlers.onMessage?.(packet.payload);
    if (packet.kind === "member") {
      rememberLocalMember(roomCode, packet.payload);
      if (packet.payload?.id) {
        localMembers[packet.payload.id] = packet.payload;
      }
      renderLocalMembers();
      if (packet.payload?.requestRoster) {
        publishLocalMember(false);
      }
    }
    if (packet.kind === "member-left") {
      removeLocalMember(roomCode, packet.payload?.id);
      delete localMembers[packet.payload?.id];
      renderLocalMembers();
    }
  };

  return {
    mode: "local",
    async connect(nextHandlers) {
      handlers = nextHandlers;
      localMembers = readLocalMembers(roomCode);
      if (!localMembers[state.session.clientId] && Object.keys(localMembers).length >= MAX_ROOM_PARTICIPANTS) {
        const roomFullError = new Error("Sala completa.");
        roomFullError.code = "ROOM_FULL";
        throw roomFullError;
      }
      if (firebaseError) {
        handlers.onConnection?.("error", "Firebase sin conexion");
        handlers.onStatus?.(`Firebase fallo (${firebaseError.code || firebaseError.message || "sin detalle"}). Modo local activo.`);
      } else {
        handlers.onConnection?.("local", "Modo local");
      }
      logEvent("local", firebaseError ? "Transporte local conectado por fallo de Firebase." : "Transporte local conectado.");
      messageHandler = (event) => receive(event.data);
      storageHandler = (event) => {
        if (event.key === storageKey && event.newValue) receive(JSON.parse(event.newValue));
        if (event.key?.startsWith(`${channelName}:member:`)) {
          localMembers = {
            ...localMembers,
            ...readLocalMembers(roomCode),
          };
          renderLocalMembers();
        }
      };
      channel?.addEventListener("message", messageHandler);
      window.addEventListener("storage", storageHandler);

      publishLocalMember(true);
      heartbeat = window.setInterval(() => {
        publishLocalMember(false);
      }, 10000);
      renderLocalMembers();
    },
    async sendState(payload) {
      postLocalEvent(channel, storageKey, "state", payload);
      logEvent("local", `Estado enviado: ${payload.action}.`);
    },
    async sendMessage(payload) {
      postLocalEvent(channel, storageKey, "message", payload);
      logEvent("local", "Mensaje enviado.");
    },
    now() {
      return Date.now();
    },
    async updateMember() {
      publishLocalMember(false);
    },
    async close() {
      if (heartbeat) window.clearTimeout(heartbeat);
      if (messageHandler) channel?.removeEventListener("message", messageHandler);
      if (storageHandler) window.removeEventListener("storage", storageHandler);
      localStorage.removeItem(memberKey);
      postLocalEvent(channel, storageKey, "member-left", { id: state.session.clientId });
      channel?.close();
    },
  };
}

function postLocalEvent(channel, storageKey, kind, payload) {
  const packet = {
    id: crypto.randomUUID(),
    kind,
    payload,
    from: state.session.clientId,
    createdAt: Date.now(),
  };
  channel?.postMessage(packet);
  localStorage.setItem(storageKey, JSON.stringify(packet));
}

function postLocalMember(channel, storageKey, memberKey, requestRoster) {
  const member = writeLocalMember(memberKey);
  postLocalEvent(channel, storageKey, "member", {
    ...member,
    requestRoster,
  });
  return member;
}

function writeLocalMember(memberKey) {
  const member = {
    id: state.session.clientId,
    name: getDisplayName(),
    lastSeenAt: Date.now(),
  };
  localStorage.setItem(memberKey, JSON.stringify(member));
  return member;
}

function rememberLocalMember(roomCode, member) {
  if (!member?.id) return;
  localStorage.setItem(localMemberKey(roomCode, member.id), JSON.stringify(member));
}

function removeLocalMember(roomCode, memberId) {
  if (!memberId) return;
  localStorage.removeItem(localMemberKey(roomCode, memberId));
}

function localMemberKey(roomCode, memberId) {
  return `cine-juntos:${roomCode}:member:${memberId}`;
}

function readLocalMembers(roomCode) {
  const prefix = `cine-juntos:${roomCode}:member:`;
  const now = Date.now();
  const members = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;

    try {
      const member = JSON.parse(localStorage.getItem(key));
      if (now - member.lastSeenAt < 35000) {
        members[member.id] = member;
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
  return members;
}

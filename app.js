const firebaseConfig = window.CINE_JUNTOS_FIREBASE_CONFIG || {};

const dom = {
  lobbyScreen: document.querySelector("#lobbyScreen"),
  sessionView: document.querySelector("#sessionView"),
  lobbyStatus: document.querySelector("#lobbyStatus"),
  connectionStatus: document.querySelector("#connectionStatus"),
  roomBadge: document.querySelector("#roomBadge"),
  hostBadge: document.querySelector("#hostBadge"),
  roomInput: document.querySelector("#roomInput"),
  lobbyNameInput: document.querySelector("#lobbyNameInput"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  videoUrlInput: document.querySelector("#videoUrlInput"),
  loadVideoButton: document.querySelector("#loadVideoButton"),
  workspace: document.querySelector(".workspace"),
  playerFrame: document.querySelector("#playerFrame"),
  videoPlayer: document.querySelector("#videoPlayer"),
  emptyPlayer: document.querySelector("#emptyPlayer"),
  playerChatToggleButton: document.querySelector("#playerChatToggleButton"),
  pageFullscreenButton: document.querySelector("#pageFullscreenButton"),
  closeInsideChatButton: document.querySelector("#closeInsideChatButton"),
  syncStatus: document.querySelector("#syncStatus"),
  videoStatusText: document.querySelector("#videoStatusText"),
  videoStatusIcon: document.querySelector("#videoStatusIcon"),
  chatStyleToggle: document.querySelector("#chatStyleToggle"),
  nameInput: document.querySelector("#nameInput"),
  dockChatButton: document.querySelector("#dockChatButton"),
  collapseChatButton: document.querySelector("#collapseChatButton"),
  presencePill: document.querySelector("#presencePill"),
  participantCount: document.querySelector("#participantCount"),
  externalChatUnread: document.querySelector("#externalChatUnread"),
  messages: document.querySelector("#messages"),
  overlayMessages: document.querySelector("#overlayMessages"),
  messageForm: document.querySelector("#messageForm"),
  messageInput: document.querySelector("#messageInput"),
  overlayMessageForm: document.querySelector("#overlayMessageForm"),
  overlayMessageInput: document.querySelector("#overlayMessageInput"),
  replyPreview: document.querySelector("#replyPreview"),
  overlayReplyPreview: document.querySelector("#overlayReplyPreview"),
  messageMenu: document.querySelector("#messageMenu"),
  messageEmojiButton: document.querySelector("#messageEmojiButton"),
  overlayEmojiButton: document.querySelector("#overlayEmojiButton"),
  emojiPopover: document.querySelector("#emojiPopover"),
  insideChatUnread: document.querySelector("#insideChatUnread"),
  tooltipLayer: document.querySelector("#tooltipLayer"),
};

const FIREBASE_VERSION = "10.12.5";
const EXAMPLE_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😮", "😢", "😡", "👍", "👏", "🔥", "✨", "❤️", "💜", "🍿", "🎬", "🌙", "⭐"];
const REMOTE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"];
const REMOTE_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
const MAX_RENDERED_MESSAGES = 100;
const CHAT_DOCKS = ["right", "bottom", "top"];
const CHAT_DOCK_META = {
  right: { icon: "panel-right", next: "bottom", label: "lateral", tooltip: "Mover chat abajo" },
  bottom: { icon: "panel-bottom", next: "top", label: "abajo", tooltip: "Mover chat arriba" },
  top: { icon: "panel-top", next: "right", label: "arriba", tooltip: "Mover chat al lateral" },
};
const MAX_DRIFT_SECONDS = 0.45;
const SEND_THROTTLE_MS = 650;
let terminalLogsEnabled =
  Boolean(window.CINE_JUNTOS_TERMINAL_LOGS) ||
  new URLSearchParams(window.location.search).get("terminalLogs") === "1";

const clientId = getOrCreateClientId();
let activeRoom = "";
let transport = null;
let lastRemoteState = null;
let lastMessageIds = new Set();
let knownParticipants = new Set([clientId]);
let knownMembers = new Map();
let suppressVideoEvents = false;
let lastStateSentAt = 0;
let lastActionAt = 0;
let lastActionAuthor = "";
let remoteStateActive = false;
let syncStatusTimer = null;
let activeEmojiInput = null;
let unreadInsideCount = 0;
let unreadExternalCount = 0;
let replyTarget = null;
let menuMessage = null;
let messageMenuOpenedAt = 0;
let longPressTimer = null;
let longPressStart = null;
let tooltipTarget = null;
let tooltipPressTimer = null;

const initialDisplayName = localStorage.getItem("cine-juntos-name") || makeGuestName();
dom.nameInput.value = initialDisplayName;
dom.lobbyNameInput.value = initialDisplayName;
dom.videoUrlInput.value = EXAMPLE_VIDEO_URL
knownMembers.set(clientId, initialDisplayName);
let hostRoomCode = sessionStorage.getItem("cine-juntos-host-room") || "";

const requestedRoom = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");
hydrateIcons();
normalizeTooltips();
wireEvents();
wireTooltipEvents();
buildEmojiPicker();
renderPresence();
setVideoStatus("empty", "Sin contenido");
setInsideChatStyle("float");
setInsideChatVisible(false);
setChatDock(localStorage.getItem("cine-juntos-chat-dock") || "right");
window.addEventListener("load", hydrateIcons);
detectTerminalLogEndpoint();

// Limpieza al cerrar pestaña, recargar o navegar fuera
// close() ya no es async: dispara el remove() de Firebase pero no bloquea.
// Para el caso abrupto, Firebase.onDisconnect se encarga del memberRef en el servidor.
window.addEventListener("pagehide", (event) => {
  if (transport) {
    transport.close();
  }
});

window.addEventListener("beforeunload", () => {
  if (transport) {
    transport.close();
  }
});

if (requestedRoom) {
  dom.roomInput.value = requestedRoom;
  joinRoom(requestedRoom);
} else {
  setConnection("local", "Modo local");
  showLobby();
}

logEvent("app", "Interfaz lista. Video de ejemplo precargado.");

function normalizeTooltips() {
  document.querySelectorAll("[data-tooltip][title]").forEach((element) => {
    element.removeAttribute("title");
  });
}

function wireEvents() {
  dom.createRoomButton.addEventListener("click", () => {
    const roomCode = generateRoomCode();
    dom.roomInput.value = roomCode;
    hostRoomCode = roomCode;
    sessionStorage.setItem("cine-juntos-host-room", roomCode);
    joinRoom(roomCode);
  });

  dom.joinRoomButton.addEventListener("click", () => {
    joinRoom(dom.roomInput.value);
  });

  dom.copyInviteButton.addEventListener("click", copyInvite);

  dom.loadVideoButton.addEventListener("click", () => {
    loadVideoFromUrl(dom.videoUrlInput.value.trim(), "manual");
  });

  dom.chatStyleToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-style]");
    if (!button) return;
    setInsideChatStyle(button.dataset.chatStyle);
  });

  dom.playerChatToggleButton.addEventListener("click", () => {
    setInsideChatVisible(!dom.playerFrame.classList.contains("chat-inside-open"));
  });

  dom.pageFullscreenButton.addEventListener("click", () => {
    togglePageFullscreen();
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
    if (Date.now() - messageMenuOpenedAt < 220) return;
    if (dom.messageMenu.contains(event.target)) return;
    hideMessageMenu();
  });

  dom.messageMenu.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action || !menuMessage) return;
    if (action === "copy") copyMessageText(menuMessage);
    if (action === "reply") setReplyTarget(menuMessage);
    hideMessageMenu();
  });

  dom.roomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      joinRoom(dom.roomInput.value);
    }
  });

  dom.lobbyNameInput.addEventListener("input", () => {
    updateDisplayName(dom.lobbyNameInput.value, dom.lobbyNameInput);
  });

  dom.nameInput.addEventListener("input", () => {
    updateDisplayName(dom.nameInput.value, dom.nameInput);
    transport?.updateMember?.(getDisplayName());
    logEvent("user", `Nombre actualizado: ${getDisplayName()}`);
  });

  document.addEventListener("fullscreenchange", handleFullscreenChange);

  dom.videoPlayer.addEventListener("dblclick", (event) => {
    event.preventDefault();
    togglePageFullscreen();
  });

  dom.videoPlayer.addEventListener("webkitbeginfullscreen", () => {
    togglePageFullscreen();
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
    input.addEventListener("input", () => autoResizeMessageInput(input));
    input.addEventListener("paste", () => window.setTimeout(() => autoResizeMessageInput(input), 0));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessageFrom(input);
      }
    });
  });

  dom.overlayMessages.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: true },
  );

  dom.videoPlayer.addEventListener("play", () => {
    logEvent("video", `Play local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!suppressVideoEvents) publishState("play");
  });

  dom.videoPlayer.addEventListener("pause", () => {
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("seeked", () => {
    logEvent("video", `Seek local a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!suppressVideoEvents) publishState("seek");
  });

  dom.videoPlayer.addEventListener("ratechange", () => {
    logEvent("video", `Velocidad local ${dom.videoPlayer.playbackRate}x.`);
    if (!suppressVideoEvents) publishState("rate");
  });

  dom.videoPlayer.addEventListener("loadedmetadata", () => {
    dom.emptyPlayer.classList.add("hidden");
    setVideoStatus("loaded", "Cargado");
  });

  dom.videoPlayer.addEventListener("error", () => {
    setVideoStatus("error", "Error");
    logEvent("error", "El navegador no pudo cargar el video.");
  });
}

async function joinRoom(rawRoomCode) {
  const roomCode = normalizeRoomCode(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }

  logEvent("room", `Entrando a sala ${roomCode}.`);

  const previousTransport = transport;
  const nextTransport = await createTransport(roomCode);
  let activeTransport = null;
  const connectionHandlers = {
    onState: handleRemoteState,
    onMessage: renderMessage,
    onMembers: renderMembers,
    onConnection: setConnection,
  };

  try {
    await nextTransport.connect(connectionHandlers);
    activeTransport = nextTransport;
  } catch (error) {
    console.error(error);
    if (nextTransport.mode === "firebase") {
      await nextTransport.close?.().catch(() => {});
      const fallbackTransport = createLocalTransport(roomCode, error);
      try {
        await fallbackTransport.connect(connectionHandlers);
        activeTransport = fallbackTransport;
      } catch (fallbackError) {
        console.error(fallbackError);
        setConnection("error", "Sin conexion");
        setSyncStatus("No se pudo entrar a la sala.");
        logEvent("error", `No se pudo entrar a ${roomCode}: ${fallbackError.message || fallbackError}`);
        return;
      }
    } else {
      setConnection("error", "Sin conexion");
      setSyncStatus("No se pudo entrar a la sala.");
      logEvent("error", `No se pudo entrar a ${roomCode}: ${error.message || error}`);
      return;
    }
  }

  await previousTransport?.close?.().catch(() => {});
  transport = activeTransport;

  activeRoom = roomCode;
  dom.roomInput.value = roomCode;
  dom.roomBadge.textContent = roomCode;
  dom.messages.innerHTML = "";
  dom.overlayMessages.innerHTML = "";
  lastMessageIds = new Set();
  knownParticipants = new Set([clientId]);
  knownMembers = new Map([[clientId, getDisplayName()]]);
  replyTarget = null;
  renderPresence();
  lastRemoteState = null;
  updateUrlRoom(roomCode);

  showSession();
  setHostBadge(hostRoomCode === roomCode);
  setInsideChatVisible(false);
  resetInsideUnread();
  resetExternalUnread();
  renderReplyPreview();
  focusMainWorkspace();
  setSyncStatus("Sala activa.");
  logEvent("room", `Sala ${roomCode} activa.`);
}

async function createTransport(roomCode) {
  let firebaseError = null;
  if (hasFirebaseConfig(firebaseConfig)) {
    try {
      return await createFirebaseTransport(roomCode, firebaseConfig);
    } catch (error) {
      firebaseError = error;
      console.error(error);
      logEvent("error", `Firebase no inicio: ${error.message || error}`);
      setConnection("error", "Firebase sin conexion");
      setSyncStatus("Firebase no inicio. Usando modo local.");
    }
  }

  return createLocalTransport(roomCode, firebaseError);
}

async function createFirebaseTransport(roomCode, config) {
  const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
  const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const dbModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`);

  const app = appModule.getApps().length ? appModule.getApps()[0] : appModule.initializeApp(config);
  const auth = authModule.getAuth(app);
  await authModule.signInAnonymously(auth);

  const db = dbModule.getDatabase(app);
  const roomPath = `rooms/${roomCode}`;
  const stateRef = dbModule.ref(db, `${roomPath}/state`);
  const messagesRef = dbModule.ref(db, `${roomPath}/messages`);
  const membersRef = dbModule.ref(db, `${roomPath}/members`);
  const memberRef = dbModule.ref(db, `${roomPath}/members/${clientId}`);
  const roomRef = dbModule.ref(db, roomPath);
  const serverTimeOffsetRef = dbModule.ref(db, ".info/serverTimeOffset");
  const unsubscribers = [];
  let serverTimeOffset = 0;

  return {
    mode: "firebase",
    async connect(handlers) {
      try {
        // === LIMPIEZA PEREZOSA AL ENTRAR ===
        // Si la sala tiene datos viejos (state/messages) pero ningún miembro activo,
        // es una sala huérfana de una sesión anterior. La borramos antes de entrar.
        const existingMembersSnap = await dbModule.get(membersRef).catch(() => null);
        if (existingMembersSnap !== null && !existingMembersSnap.exists()) {
          // No hay miembros registrados: verificar si hay datos residuales
          const existingRoomSnap = await dbModule.get(roomRef).catch(() => null);
          if (existingRoomSnap?.exists()) {
            logEvent("firebase", "Sala huerfana detectada al entrar. Limpiando datos residuales.");
            await dbModule.remove(roomRef).catch(() => {});
          }
        }

        // Registrar nuestra presencia
        await dbModule.set(memberRef, makeMemberPayload());

        // onDisconnect: Firebase borra nuestra presencia si nos desconectamos abruptamente
        // (cierre de pestaña, pérdida de red). Cuando memberRef se borra y members queda
        // vacío, el trigger del listener en otros clientes limpiará la sala.
        dbModule.onDisconnect(memberRef).remove().catch(() => {});

      } catch (error) {
        const wrapped = new Error(error?.message || "No se pudo escribir en members.");
        wrapped.code = error?.code || "FIREBASE_PERMISSION_DENIED";
        throw wrapped;
      }

      handlers.onConnection("firebase", "Firebase conectado");
      logEvent("firebase", "Sesion anonima conectada.");

      unsubscribers.push(
        dbModule.onValue(serverTimeOffsetRef, (snapshot) => {
          serverTimeOffset = Number(snapshot.val()) || 0;
          logEvent("firebase", `Offset de tiempo: ${Math.round(serverTimeOffset)} ms.`);
        }),
      );

      unsubscribers.push(
        dbModule.onValue(stateRef, (snapshot) => {
          if (snapshot.exists()) handlers.onState(snapshot.val());
        }),
      );

      unsubscribers.push(
        dbModule.onValue(membersRef, (snapshot) => {
          const val = snapshot.val() || {};
          const membersList = Object.keys(val);

          // Cuando la sala queda completamente vacía (todos se fueron),
          // el último cliente activo que recibe este evento limpia la sala.
          if (!snapshot.exists() || membersList.length === 0) {
            logEvent("firebase", "Sala vacia detectada. Limpiando datos residuales.");
            dbModule.remove(roomRef).catch(() => {});
          }

          handlers.onMembers(val);
        }),
      );

      const latestMessagesQuery = dbModule.query(messagesRef, dbModule.limitToLast(100));
      unsubscribers.push(
        dbModule.onChildAdded(latestMessagesQuery, (snapshot) => {
          handlers.onMessage({ id: snapshot.key, ...snapshot.val() });
        }),
      );
    },
    async sendState(payload) {
      await dbModule.set(stateRef, {
        ...payload,
        serverTime: dbModule.serverTimestamp(),
      });
      logEvent("firebase", `Estado enviado: ${payload.action}.`);
    },
    async sendMessage(payload) {
      await dbModule.push(messagesRef, {
        ...payload,
        serverTime: dbModule.serverTimestamp(),
      });
      logEvent("firebase", "Mensaje enviado.");
    },
    now() {
      return Date.now() + serverTimeOffset;
    },
    async updateMember() {
      await dbModule.set(memberRef, makeMemberPayload());
    },
    close() {
      // Cancelar listeners locales inmediatamente
      unsubscribers.forEach((unsubscribe) => unsubscribe());

      // Remover presencia: si cierra tab (beforeunload), el navegador puede
      // no esperar la promesa; Firebase lo maneja via onDisconnect del servidor.
      // Si es un cierre voluntario (cambio de sala), la promesa se completa normalmente.
      dbModule.remove(memberRef).then(async () => {
        // Verificar si quedan miembros. Si no, limpiar la sala completa.
        try {
          const snap = await dbModule.get(membersRef);
          if (!snap.exists() || Object.keys(snap.val() || {}).length === 0) {
            logEvent("firebase", "Limpiando sala vacia al salir.");
            await dbModule.remove(roomRef);
          }
        } catch (e) {
          console.warn("Error al verificar limpieza al salir:", e);
        }
      }).catch(() => {});
    },
  };
}

function createLocalTransport(roomCode, firebaseError = null) {
  const channelName = `cine-juntos:${roomCode}`;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
  const storageKey = `${channelName}:event`;
  const memberKey = `${channelName}:member:${clientId}`;
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
    if (!packet || packet.from === clientId) return;
    rememberParticipant(packet.from, packet.payload?.name);
    if (packet.kind === "state") handlers.onState?.(packet.payload);
    if (packet.kind === "message") handlers.onMessage?.(packet.payload);
    if (packet.kind === "member") {
      rememberParticipant(packet.payload?.id, packet.payload?.name);
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
      if (firebaseError) {
        handlers.onConnection("error", "Firebase sin conexion");
        setSyncStatus(`Firebase fallo (${firebaseError.code || firebaseError.message || "sin detalle"}). Modo local activo.`);
      } else {
        handlers.onConnection("local", "Modo local");
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
      if (heartbeat) window.clearInterval(heartbeat);
      if (messageHandler) channel?.removeEventListener("message", messageHandler);
      if (storageHandler) window.removeEventListener("storage", storageHandler);
      localStorage.removeItem(memberKey);
      postLocalEvent(channel, storageKey, "member-left", { id: clientId });
      channel?.close();
    },
  };
}

function postLocalEvent(channel, storageKey, kind, payload) {
  const packet = {
    id: crypto.randomUUID(),
    kind,
    payload,
    from: clientId,
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
    id: clientId,
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

function makeMemberPayload() {
  return {
    id: clientId,
    name: getDisplayName(),
    lastSeenAt: getTransportNow(),
  };
}

function handleRemoteState(state) {
  if (!state || state.from === clientId) return;
  rememberParticipant(state.from, state.name);
  lastRemoteState = state;
  logEvent("sync:recv", `${state.action || "evento"} de ${state.name || "otro usuario"} en ${formatSeconds(state.time)}.`);
  
  // Registrar el tiempo y autor de la última acción recibida de Firebase
  lastActionAt = Date.now();
  lastActionAuthor = state.from;
  
  applyRemoteState(state);
}

async function applyRemoteState(state, force = false) {
  if (!state.src && !dom.videoPlayer.currentSrc) return;

  suppressVideoEvents = true;
  remoteStateActive = true;
  try {
    if (state.src && state.src !== dom.videoPlayer.currentSrc && state.src !== dom.videoPlayer.src) {
      setVideoSource(state.src, false);
      await waitForVideoMetadata().catch(() => {});
    }

    const targetTime = getRemoteTargetTime(state);
    if (Number.isFinite(targetTime) && (force || Math.abs(dom.videoPlayer.currentTime - targetTime) > MAX_DRIFT_SECONDS)) {
      dom.videoPlayer.currentTime = Math.max(0, targetTime);
    }

    if (Number.isFinite(state.rate) && dom.videoPlayer.playbackRate !== state.rate) {
      dom.videoPlayer.playbackRate = state.rate;
    }

    if (state.paused) {
      dom.videoPlayer.pause();
    } else {
      // Manejar de forma robusta la promesa de play() para evitar congelamiento o errores no capturados
      try {
        await dom.videoPlayer.play();
      } catch (playError) {
        console.warn("La reproducción automática fue bloqueada o interrumpida:", playError);
        setSyncStatus("Play recibido. Haz click para reproducir.");
      }
    }

    setSyncStatus(`Sincronizado con ${state.name || "la sala"}.`);
    logEvent("sync:apply", `Aplicado ${state.action || "evento"} a ${formatSeconds(dom.videoPlayer.currentTime)}.`);
  } catch (err) {
    console.error("Error aplicando el estado remoto:", err);
  } finally {
    window.setTimeout(() => {
      suppressVideoEvents = false;
      remoteStateActive = false;
    }, 550);
  }
}

function getRemoteTargetTime(state) {
  const baseTime = Number(state.time);
  if (!Number.isFinite(baseTime)) return 0;
  if (state.paused) return baseTime;

  const sentAt = Number(state.sentAt);
  const rate = Number.isFinite(Number(state.rate)) ? Number(state.rate) : 1;
  const elapsed = Number.isFinite(sentAt) ? Math.max(0, (getTransportNow() - sentAt) / 1000) : 0;
  return baseTime + elapsed * rate;
}

function publishState(action) {
  if (!activeRoom || !transport) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }

  // Si estamos aplicando un estado remoto, ignoramos disparar un evento local
  if (remoteStateActive) return;

  const localNow = Date.now();
  
  // Mecanismo Antilag/Cooldown:
  // Si la última acción de la sala la hizo OTRO usuario hace menos de 2000 ms, bloqueamos el control.
  if (lastActionAuthor && lastActionAuthor !== clientId && (localNow - lastActionAt < 2000)) {
    logEvent("antilag", `Acción '${action}' bloqueada temporalmente (cooldown de otro usuario activo).`);
    setSyncStatus("Espera 2s para interactuar (cooldown).");
    
    // Revertir nuestro reproductor local al último estado remoto conocido para evitar desincronizaciones
    if (lastRemoteState && !suppressVideoEvents) {
      suppressVideoEvents = true;
      try {
        if (lastRemoteState.paused) {
          dom.videoPlayer.pause();
        } else {
          dom.videoPlayer.play().catch(() => {});
        }
        dom.videoPlayer.currentTime = getRemoteTargetTime(lastRemoteState);
      } finally {
        window.setTimeout(() => { suppressVideoEvents = false; }, 300);
      }
    }
    return;
  }

  if (localNow - lastStateSentAt < SEND_THROTTLE_MS && action !== "video" && action !== "sync") return;
  
  // Registrar que nosotros iniciamos esta acción
  lastActionAt = localNow;
  lastActionAuthor = clientId;
  lastStateSentAt = localNow;
  
  const syncNow = getTransportNow();

  const payload = {
    action,
    from: clientId,
    name: getDisplayName(),
    src: dom.videoPlayer.currentSrc || dom.videoPlayer.src || dom.videoUrlInput.value.trim(),
    time: Number(dom.videoPlayer.currentTime || 0),
    paused: dom.videoPlayer.paused,
    rate: Number(dom.videoPlayer.playbackRate || 1),
    sentAt: syncNow,
  };

  transport.sendState(payload).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar sincronizacion: ${error.message || error}`);
    setSyncStatus("No se pudo enviar la sincronizacion.");
  });
  sendVideoEventMessage(action, payload);
  logEvent("sync:send", `${action} en ${formatSeconds(payload.time)} (${payload.paused ? "pausado" : "play"}).`);
}

function sendMessage(text) {
  if (!activeRoom || !transport) {
    setSyncStatus("Primero entra a una sala.");
    logEvent("chat", "Mensaje no enviado: falta sala.");
    return false;
  }

  const message = {
    id: crypto.randomUUID(),
    from: clientId,
    name: getDisplayName(),
    text,
    replyTo: replyTarget
      ? {
          id: replyTarget.id,
          name: replyTarget.name,
          text: replyTarget.text,
        }
      : null,
    createdAt: getTransportNow(),
  };

  transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar mensaje: ${error.message || error}`);
    setSyncStatus("No se pudo enviar el mensaje.");
  });

  if (transport.mode === "local") renderMessage(message);
  clearReplyTarget();
  logEvent("chat:send", `Mensaje de ${message.name}.`);
  return true;
}

function sendVideoEventMessage(action, state) {
  const text = describeVideoEvent(action, state);
  if (!text) return;

  const message = {
    id: crypto.randomUUID(),
    from: clientId,
    name: getDisplayName(),
    text,
    system: true,
    createdAt: getTransportNow(),
  };

  transport.sendMessage(message).catch((error) => {
    console.error(error);
    logEvent("error", `No se pudo enviar evento al chat: ${error.message || error}`);
  });

  if (transport.mode === "local") renderMessage(message);
}

function describeVideoEvent(action, state) {
  const name = state.name || getDisplayName();
  const time = formatClockTime(state.time);
  if (action === "play") return `${name} reprodujo el video en ${time}.`;
  if (action === "pause") return `${name} pauso el video en ${time}.`;
  if (action === "seek") return `${name} salto a ${time}.`;
  if (action === "rate") return `${name} cambio la velocidad a ${state.rate}x.`;
  if (action === "video") return `${name} cargo un video nuevo.`;
  return "";
}

function renderMessage(message) {
  if (!message?.text || lastMessageIds.has(message.id)) return;
  lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);

  appendMessageTo(dom.messages, message);
  appendMessageTo(dom.overlayMessages, message);
  if (
    message.from !== clientId &&
    !dom.playerFrame.classList.contains("chat-inside-open") &&
    dom.sessionView.classList.contains("chat-collapsed")
  ) {
    incrementInsideUnread();
  }
  if (message.from !== clientId && dom.sessionView.classList.contains("chat-collapsed")) {
    incrementExternalUnread();
  }
  logEvent("chat:recv", `Mensaje recibido de ${message.name || "Invitado"}.`);
}

function appendMessageTo(container, message) {
  const item = document.createElement("article");
  item.className = `message${message.from === clientId ? " mine" : ""}${message.system ? " system" : ""}`;
  item.dataset.messageId = message.id;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${message.name || "Invitado"} · ${formatTime(message.createdAt)}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  if (message.replyTo?.text) {
    const reply = document.createElement("div");
    reply.className = "message-reply";
    reply.textContent = `${message.replyTo.name || "Invitado"}: ${truncateText(message.replyTo.text, 90)}`;
    bubble.append(reply);
  }
  appendMessageContent(bubble, message.text);

  item.append(meta, bubble);
  if (!message.system) wireMessageInteractions(item, message);
  container.append(item);
  trimRenderedMessages(container);
  container.scrollTop = container.scrollHeight;
}

function appendMessageContent(container, text) {
  const firstUrl = findFirstUrl(text);
  const explicitImageUrl = parseExplicitImageUrl(text);
  const imageUrl = explicitImageUrl || (firstUrl && isRemoteImageUrl(firstUrl) ? firstUrl : "");
  const videoUrl = firstUrl && isRemoteVideoUrl(firstUrl) ? firstUrl : "";
  const trimmedText = String(text || "").trim();

  if (!firstUrl) {
    if (container.childElementCount) {
      const textNode = document.createElement("div");
      textNode.className = "message-text";
      textNode.textContent = trimmedText;
      container.append(textNode);
    } else {
      container.textContent = trimmedText;
    }
    return;
  }

  const textWithoutUrl = trimmedText.replace(firstUrl, "").trim();
  if (textWithoutUrl) {
    const textNode = document.createElement("div");
    textNode.className = "message-text";
    textNode.textContent = textWithoutUrl;
    container.append(textNode);
  }

  if (videoUrl) {
    const video = document.createElement("video");
    video.className = "message-video";
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    container.append(video);
    return;
  }

  const link = document.createElement("a");
  const shouldAttemptImagePreview = Boolean(imageUrl || (firstUrl && trimmedText === firstUrl && !videoUrl));
  link.className = shouldAttemptImagePreview ? "message-media-link" : "message-link";
  link.href = firstUrl;
  link.target = "_blank";
  link.rel = "noreferrer";

  if (!shouldAttemptImagePreview) {
    link.textContent = firstUrl;
    container.append(link);
    return;
  }

  const image = document.createElement("img");
  image.className = "message-media";
  image.src = imageUrl || firstUrl;
  image.alt = "Imagen enviada";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener(
    "error",
    () => {
      link.className = "message-link";
      link.replaceChildren();
      link.textContent = firstUrl;
    },
    { once: true },
  );

  link.append(image);
  container.append(link);
}

function trimRenderedMessages(container) {
  while (container.children.length > MAX_RENDERED_MESSAGES) {
    container.firstElementChild?.remove();
  }
}

function findFirstUrl(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;]+$/g, "");
    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }
  return "";
}

function parseExplicitImageUrl(text) {
  const match = String(text || "")
    .trim()
    .match(/^(?:img|image)\s*=\s*(https?:\/\/\S+)$/i);
  if (!match) return "";
  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return "";
  }
}

function isRemoteImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (isLocalHostname(url.hostname)) return false;
  const path = url.pathname.toLowerCase();
  return REMOTE_IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isRemoteVideoUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (isLocalHostname(url.hostname)) return false;
  const path = url.pathname.toLowerCase();
  return REMOTE_VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host === "0.0.0.0" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^169\.254\./.test(host)) return true;
  return false;
}

function renderMembers(members) {
  const nextMembers = new Map([[clientId, getDisplayName()]]);
  const activeIds = new Set([clientId]);
  
  Object.entries(members || {}).forEach(([id, member]) => {
    const memberId = member?.id || id;
    if (!memberId) return;
    nextMembers.set(memberId, member?.name || makeParticipantLabel(memberId));
    activeIds.add(memberId);
  });
  
  knownMembers = nextMembers;
  knownParticipants = activeIds;
  renderPresence();
}

function rememberParticipant(participantId, participantName) {
  if (!participantId) return;
  // Solo los guardamos en knownMembers/knownParticipants si están en el set actual
  // o si no había mapa previo cargado (para evitar revivir fantasmas)
  if (knownMembers.has(participantId) || knownParticipants.has(participantId)) {
    knownMembers.set(participantId, participantName || knownMembers.get(participantId) || makeParticipantLabel(participantId));
  } else {
    // Si es un mensaje nuevo, lo permitimos temporalmente en participantes para mostrar el contador
    // pero respetando la roster real de Firebase que es la definitiva.
  }
}

function renderPresence() {
  if (!dom.participantCount || !dom.presencePill) return;

  const members = Array.from(knownMembers.entries())
    .filter(([id]) => knownParticipants.has(id))
    .map(([id, name]) => (id === clientId ? `${name || makeGuestName()} (vos)` : name || makeParticipantLabel(id)));

  const uniqueMembers = members.length ? members : [`${getDisplayName()} (vos)`];
  dom.participantCount.textContent = String(uniqueMembers.length);
  dom.presencePill.dataset.tooltip = `Conectados: ${uniqueMembers.join(", ")}`;
  dom.presencePill.removeAttribute("title");
  dom.presencePill.setAttribute("aria-label", `${uniqueMembers.length} usuarios conectados`);
}

function showLobby() {
  dom.lobbyScreen.hidden = false;
  dom.sessionView.hidden = true;
  document.body.classList.add("is-lobby");
  setHostBadge(false);
}

function showSession() {
  dom.lobbyScreen.hidden = true;
  dom.sessionView.hidden = false;
  document.body.classList.remove("is-lobby");
}

function setHostBadge(visible) {
  if (!dom.hostBadge) return;
  dom.hostBadge.hidden = !visible;
}

function focusMainWorkspace() {
  window.requestAnimationFrame(() => {
    dom.workspace?.scrollIntoView({ block: "start" });
  });
}

function focusFullscreenWorkspace() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    dom.workspace?.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

function updateDisplayName(value, sourceInput) {
  const nextName = String(value || "").slice(0, 28);
  if (sourceInput !== dom.nameInput) dom.nameInput.value = nextName;
  if (sourceInput !== dom.lobbyNameInput) dom.lobbyNameInput.value = nextName;
  localStorage.setItem("cine-juntos-name", nextName.trim() || makeGuestName());
  knownMembers.set(clientId, getDisplayName());
  renderPresence();
}

async function togglePageFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (document.body.classList.contains("fullscreen-mode")) {
      document.body.classList.remove("fullscreen-mode");
      handleFullscreenChange();
      return;
    }

    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else {
      document.body.classList.toggle("fullscreen-mode");
      handleFullscreenChange();
    }
  } catch (error) {
    console.error(error);
    logEvent("error", `No se pudo activar pantalla completa: ${error.message || error}`);
    document.body.classList.add("fullscreen-mode");
    handleFullscreenChange();
    setSyncStatus("Modo pantalla activado sin fullscreen del navegador.");
  }
}

function handleFullscreenChange() {
  if (document.fullscreenElement === dom.videoPlayer) {
    document.exitFullscreen().catch(() => {});
    document.body.classList.add("fullscreen-mode");
  }

  const isFullscreen = Boolean(document.fullscreenElement) || document.body.classList.contains("fullscreen-mode");
  const icon = dom.pageFullscreenButton.querySelector("[data-lucide]");

  document.documentElement.classList.toggle("fullscreen-mode", isFullscreen);
  document.body.classList.toggle("fullscreen-mode", isFullscreen);
  dom.pageFullscreenButton.classList.toggle("active", isFullscreen);
  dom.pageFullscreenButton.dataset.tooltip = isFullscreen ? "Salir de pantalla completa" : "Pantalla completa con controles visibles";
  dom.pageFullscreenButton.removeAttribute("title");
  dom.pageFullscreenButton.setAttribute("aria-label", dom.pageFullscreenButton.dataset.tooltip);
  if (icon) {
    icon.setAttribute("data-lucide", isFullscreen ? "minimize" : "maximize");
    icon.innerHTML = "";
  }
  hydrateIcons();
  if (isFullscreen) focusFullscreenWorkspace();
  logEvent("ui", isFullscreen ? "Pantalla completa de pagina activada." : "Pantalla completa desactivada.");
}

function getTransportNow() {
  return transport?.now?.() || Date.now();
}

function loadVideoFromUrl(source, origin) {
  if (!source) {
    setVideoStatus("empty", "Sin contenido");
    logEvent("video", "No se cargo video: falta URL.");
    return;
  }

  setVideoSource(source, true);
  logEvent("video", `Video ${origin} cargado: ${source}`);
  if (activeRoom && transport) {
    publishState("video");
  }
}

function submitMessageFrom(input) {
  const text = input.value.trim();
  if (!text) return;
  const wasQueued = sendMessage(text);
  if (!wasQueued) return;
  input.value = "";
  autoResizeMessageInput(input);
  if (input === dom.overlayMessageInput) {
    dom.overlayMessageInput.focus();
  }
}

function autoResizeMessageInput(input) {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, input === dom.overlayMessageInput ? 86 : 118)}px`;
  input.scrollTop = input.scrollHeight;
}

function setInsideChatVisible(visible) {
  dom.playerFrame.classList.toggle("chat-inside-open", visible);
  dom.playerChatToggleButton.classList.toggle("active", visible);
  dom.playerChatToggleButton.setAttribute("aria-pressed", String(visible));

  if (visible) {
    dom.overlayMessages.scrollTop = dom.overlayMessages.scrollHeight;
    resetInsideUnread();
  }
  logEvent("ui", visible ? "Chat interno visible." : "Chat interno oculto.");
}

function setInsideChatStyle(style) {
  const nextStyle = ["float", "panel"].includes(style) ? style : "float";
  dom.playerFrame.dataset.chatStyle = nextStyle;
  dom.chatStyleToggle.querySelectorAll("[data-chat-style]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chatStyle === nextStyle);
  });
  logEvent("ui", `Estilo de chat interno: ${nextStyle}.`);
}

function setChatDock(dock) {
  const nextDock = CHAT_DOCKS.includes(dock) ? dock : "right";
  const meta = CHAT_DOCK_META[nextDock];
  const icon = dom.dockChatButton.querySelector("[data-lucide]");

  dom.sessionView.dataset.chatDock = nextDock;
  dom.dockChatButton.dataset.tooltip = meta.tooltip;
  dom.dockChatButton.removeAttribute("title");
  dom.dockChatButton.setAttribute("aria-label", `Chat ${meta.label}. ${meta.tooltip}`);
  if (icon) {
    icon.setAttribute("data-lucide", meta.icon);
    icon.innerHTML = "";
  }
  localStorage.setItem("cine-juntos-chat-dock", nextDock);
  hydrateIcons();
  updateCollapseButton();
  logEvent("ui", `Chat lateral en posicion: ${meta.label}.`);
}

function setExternalChatCollapsed(collapsed) {
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  if (!collapsed) resetExternalUnread();
  updateCollapseButton();
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");
}

function updateCollapseButton() {
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

function buildEmojiPicker() {
  dom.emojiPopover.innerHTML = "";
  EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.className = "emoji-option";
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      insertEmoji(emoji);
    });
    dom.emojiPopover.append(button);
  });
}

function toggleEmojiPicker(input, anchor) {
  activeEmojiInput = input;
  if (!dom.emojiPopover.hidden && dom.emojiPopover.dataset.anchor === anchor.id) {
    hideEmojiPicker();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  dom.emojiPopover.hidden = false;
  dom.emojiPopover.dataset.anchor = anchor.id;
  const top = Math.max(8, rect.top - dom.emojiPopover.offsetHeight - 8);
  const left = Math.min(window.innerWidth - dom.emojiPopover.offsetWidth - 8, Math.max(8, rect.left));
  dom.emojiPopover.style.top = `${top}px`;
  dom.emojiPopover.style.left = `${left}px`;
}

function hideEmojiPicker() {
  dom.emojiPopover.hidden = true;
  dom.emojiPopover.dataset.anchor = "";
}

function insertEmoji(emoji) {
  if (!activeEmojiInput) return;
  const start = activeEmojiInput.selectionStart ?? activeEmojiInput.value.length;
  const end = activeEmojiInput.selectionEnd ?? activeEmojiInput.value.length;
  activeEmojiInput.value = `${activeEmojiInput.value.slice(0, start)}${emoji}${activeEmojiInput.value.slice(end)}`;
  const nextPosition = start + emoji.length;
  activeEmojiInput.focus();
  activeEmojiInput.setSelectionRange(nextPosition, nextPosition);
  hideEmojiPicker();
}

function wireTooltipEvents() {
  if (!dom.tooltipLayer) return;

  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target && isPointInsideElement(target, event.clientX, event.clientY)) showTooltip(target);
  });

  document.addEventListener("pointerout", (event) => {
    if (!tooltipTarget) return;
    if (event.relatedTarget instanceof Node && tooltipTarget.contains(event.relatedTarget)) return;
    const target = event.target.closest?.("[data-tooltip]");
    if (target === tooltipTarget) hideTooltip();
  });

  document.addEventListener("pointermove", (event) => {
    if (!tooltipTarget) return;
    if (!isPointInsideElement(tooltipTarget, event.clientX, event.clientY)) hideTooltip();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (!target) return;
    if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) return;
    showTooltip(target);
    window.clearTimeout(tooltipPressTimer);
    tooltipPressTimer = window.setTimeout(hideTooltip, 2200);
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target) showTooltip(target);
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.("[data-tooltip]")) hideTooltip();
  });

  window.addEventListener("resize", hideTooltip);
  window.addEventListener("scroll", hideTooltip, true);
}

function isPointInsideElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function showTooltip(target) {
  const text = target.dataset.tooltip;
  if (!text) return;
  tooltipTarget = target;
  dom.tooltipLayer.textContent = text;
  dom.tooltipLayer.hidden = false;
  positionTooltip(target);
}

function positionTooltip(target) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = dom.tooltipLayer.getBoundingClientRect();
  const viewportPadding = 8;
  const topCandidate = rect.top - tooltipRect.height - 8;
  const top = topCandidate >= viewportPadding ? topCandidate : rect.bottom + 8;
  const left = Math.min(
    window.innerWidth - tooltipRect.width - viewportPadding,
    Math.max(viewportPadding, rect.left + rect.width / 2 - tooltipRect.width / 2),
  );

  dom.tooltipLayer.style.top = `${Math.max(viewportPadding, top)}px`;
  dom.tooltipLayer.style.left = `${left}px`;
}

function hideTooltip() {
  tooltipTarget = null;
  window.clearTimeout(tooltipPressTimer);
  dom.tooltipLayer.hidden = true;
}

function incrementInsideUnread() {
  unreadInsideCount += 1;
  dom.insideChatUnread.textContent = String(Math.min(unreadInsideCount, 99));
  dom.insideChatUnread.hidden = false;
  dom.playerChatToggleButton.classList.add("has-unread");
}

function resetInsideUnread() {
  unreadInsideCount = 0;
  dom.insideChatUnread.hidden = true;
  dom.playerChatToggleButton.classList.remove("has-unread");
}

function incrementExternalUnread() {
  unreadExternalCount += 1;
  dom.externalChatUnread.textContent = String(Math.min(unreadExternalCount, 99));
  dom.externalChatUnread.hidden = false;
}

function resetExternalUnread() {
  unreadExternalCount = 0;
  dom.externalChatUnread.hidden = true;
}

function setReplyTarget(message) {
  replyTarget = {
    id: message.id,
    name: message.name || "Invitado",
    text: message.text || "",
  };
  renderReplyPreview();
  dom.messageInput.focus();
}

function clearReplyTarget() {
  replyTarget = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  [dom.replyPreview, dom.overlayReplyPreview].forEach((container) => {
    if (!container) return;
    container.innerHTML = "";
    if (!replyTarget) {
      container.hidden = true;
      return;
    }

    const text = document.createElement("span");
    text.textContent = `Respondiendo a ${replyTarget.name}: ${truncateText(replyTarget.text, 54)}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Cancelar respuesta");
    close.addEventListener("click", clearReplyTarget);
    container.append(text, close);
    container.hidden = false;
  });
}

function wireMessageInteractions(item, message) {
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMessageMenu(message, event.clientX, event.clientY);
  });

  item.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    longPressStart = { x: event.clientX, y: event.clientY, message };
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      showMessageMenu(message, event.clientX, event.clientY);
    }, 560);
  });

  item.addEventListener("pointermove", (event) => {
    if (!longPressStart) return;
    const distance = Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y);
    if (distance > 10) window.clearTimeout(longPressTimer);
  });

  item.addEventListener("pointerup", (event) => {
    window.clearTimeout(longPressTimer);
    if (longPressStart?.message === message && Math.abs(event.clientX - longPressStart.x) > 54) {
      setReplyTarget(message);
    }
    longPressStart = null;
  });

  item.addEventListener("pointercancel", () => {
    window.clearTimeout(longPressTimer);
    longPressStart = null;
  });
}

function showMessageMenu(message, x, y) {
  menuMessage = message;
  messageMenuOpenedAt = Date.now();
  dom.messageMenu.hidden = false;
  const rect = dom.messageMenu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  dom.messageMenu.style.left = `${left}px`;
  dom.messageMenu.style.top = `${top}px`;
}

function hideMessageMenu() {
  menuMessage = null;
  dom.messageMenu.hidden = true;
}

function copyMessageText(message) {
  navigator.clipboard?.writeText(message.text || "").catch(() => {});
  logEvent("chat", "Mensaje copiado.");
}

function truncateText(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function setVideoSource(source, shouldAnnounce) {
  dom.videoPlayer.src = source;
  setVideoStatus("loading", "Cargando");
  dom.videoPlayer.load();
  dom.emptyPlayer.classList.add("hidden");
  dom.videoUrlInput.value = source;
  if (shouldAnnounce) logEvent("video", "Carga de video iniciada.");
}

function setVideoStatus(state, text) {
  const iconByState = {
    empty: "circle",
    loading: "refresh-cw",
    loaded: "check-circle",
    error: "circle-alert",
  };
  dom.syncStatus.className = `sync-status video-status ${state}`;
  dom.videoStatusText.textContent = text;
  dom.videoStatusIcon.setAttribute("data-lucide", iconByState[state] || "circle");
  dom.videoStatusIcon.innerHTML = "";
  hydrateIcons();
}

function waitForVideoMetadata() {
  if (Number.isFinite(dom.videoPlayer.duration)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    dom.videoPlayer.addEventListener("loadedmetadata", done, { once: true });
    dom.videoPlayer.addEventListener("error", done, { once: true });
  });
}

async function copyInvite() {
  if (!activeRoom) {
    setSyncStatus("Primero entra a una sala.");
    return;
  }
  const invite = new URL(window.location.href);
  invite.searchParams.set("room", activeRoom);
  await navigator.clipboard.writeText(invite.toString()).catch(() => {});
  setSyncStatus("Invitacion copiada.");
}

function setConnection(mode, label) {
  dom.connectionStatus.className = `status-pill ${mode}`;
  dom.connectionStatus.textContent = label;
  logEvent("connection", label);
}

function setSyncStatus(text) {
  window.clearTimeout(syncStatusTimer);
  if (dom.lobbyStatus) dom.lobbyStatus.textContent = text;
  syncStatusTimer = window.setTimeout(() => {
    if (dom.lobbyStatus) dom.lobbyStatus.textContent = "Listo";
  }, 4500);
}

function updateUrlRoom(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url);
}

function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function generateRoomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
}

function hasFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.databaseURL && config.projectId && config.appId);
}

function getDisplayName() {
  return dom.nameInput.value.trim().slice(0, 28) || makeGuestName();
}

function makeGuestName() {
  return `Usuario ${clientId.slice(-4).toUpperCase()}`;
}

function makeParticipantLabel(participantId) {
  return `Usuario ${String(participantId).slice(-4).toUpperCase()}`;
}

function getOrCreateClientId() {
  const stored = localStorage.getItem("cine-juntos-client-id");
  if (stored) return stored;
  const next = crypto.randomUUID();
  localStorage.setItem("cine-juntos-client-id", next);
  return next;
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds)) return "0.0s";
  return `${seconds.toFixed(1)}s`;
}

function formatClockTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function logEvent(kind, message) {
  const now = new Date();
  const time = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.info(`[${time}] [${kind}] ${message}`);
  sendTerminalLog({
    at: now.toISOString(),
    room: activeRoom || null,
    client: clientId.slice(-6),
    kind,
    message,
  });
}

function sendTerminalLog(payload) {
  if (!terminalLogsEnabled) return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/__client-log", new Blob([body], { type: "application/json" }));
    return;
  }

  fetch("/__client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function detectTerminalLogEndpoint() {
  if (terminalLogsEnabled || window.location.protocol === "file:") return;

  fetch("/__client-log-ready", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) return;
      terminalLogsEnabled = true;
      logEvent("app", "Logs de terminal conectados.");
    })
    .catch(() => {});
}

function hydrateIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

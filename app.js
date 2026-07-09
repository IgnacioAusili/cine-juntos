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
  mainMessageSend: document.querySelector("#mainMessageSend"),
  overlayMessageForm: document.querySelector("#overlayMessageForm"),
  overlayMessageInput: document.querySelector("#overlayMessageInput"),
  overlayMessageSend: document.querySelector("#overlayMessageSend"),
  replyPreview: document.querySelector("#replyPreview"),
  overlayReplyPreview: document.querySelector("#overlayReplyPreview"),
  messageMenu: document.querySelector("#messageMenu"),
  messageEmojiButton: document.querySelector("#messageEmojiButton"),
  overlayEmojiButton: document.querySelector("#overlayEmojiButton"),
  emojiPopover: document.querySelector("#emojiPopover"),
  insideChatUnread: document.querySelector("#insideChatUnread"),
  tooltipLayer: document.querySelector("#tooltipLayer"),
  imagePreview: document.querySelector("#imagePreview"),
  overlayImagePreview: document.querySelector("#overlayImagePreview"),
  mainScrollBottomBtn: document.querySelector("#mainScrollBottomBtn"),
  overlayScrollBottomBtn: document.querySelector("#overlayScrollBottomBtn"),
  mainScrollBadge: document.querySelector("#mainScrollBadge"),
  overlayScrollBadge: document.querySelector("#overlayScrollBadge"),
  mainCharCounter: document.querySelector("#mainCharCounter"),
  overlayCharCounter: document.querySelector("#overlayCharCounter"),
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
let pendingImage = "";
let pendingOverlayImage = "";
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

  dom.messageInput.addEventListener("paste", (e) => handlePasteEvent(e, false));
  dom.overlayMessageInput.addEventListener("paste", (e) => handlePasteEvent(e, true));

  // Scroll-to-bottom buttons
  dom.mainScrollBottomBtn.addEventListener("click", () => {
    dom.messages.scrollTo({ top: dom.messages.scrollHeight, behavior: "smooth" });
    resetScrollIndicator(false);
  });
  dom.overlayScrollBottomBtn.addEventListener("click", () => {
    dom.overlayMessages.scrollTo({ top: dom.overlayMessages.scrollHeight, behavior: "smooth" });
    resetScrollIndicator(true);
  });

  // Detectar cuando el usuario scrollea manualmente en los contenedores de mensajes
  dom.messages.addEventListener("scroll", () => checkScrollPosition(false), { passive: true });
  dom.overlayMessages.addEventListener("scroll", () => checkScrollPosition(true), { passive: true });

  dom.overlayMessages.addEventListener(
    "wheel",
    (event) => {
      event.stopPropagation();
    },
    { passive: true },
  );


  let scrollSnapTimer = null;
  window.addEventListener("scroll", () => {
    const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
    if (!isFullscreen || !dom.workspace) return;

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      const targetY = dom.workspace.offsetTop;
      const currentY = window.scrollY;
      const diff = Math.abs(currentY - targetY);
      if (diff > 0 && diff < 65) {
        window.scrollTo({
          top: targetY,
          behavior: "smooth"
        });
      }
    }, 100);
  }, { passive: true });

  dom.videoPlayer.addEventListener("play", () => {
    logEvent("video", `Play local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!suppressVideoEvents) publishState("play");
  });

  dom.videoPlayer.addEventListener("pause", () => {
    // El evento 'ended' dispara 'pause' internamente; lo ignoramos para no mostrar "pausó" al terminar
    if (dom.videoPlayer.ended) return;
    logEvent("video", `Pausa local en ${formatSeconds(dom.videoPlayer.currentTime)}.`);
    if (!suppressVideoEvents) publishState("pause");
  });

  dom.videoPlayer.addEventListener("ended", () => {
    logEvent("video", "Video terminado.");
    // No publicar estado: el video terminó naturalmente, no es una acción del usuario
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
    setVideoStatus("loaded", "Incorporado en sala");
  });

  dom.videoPlayer.addEventListener("error", () => {
    setVideoStatus("error", "Error");
    logEvent("error", "El navegador no pudo cargar el video.");
  });
}

// Registro global de salas abiertas en esta sesión de navegador (máximo 2)
const openRooms = JSON.parse(sessionStorage.getItem("cine-juntos-open-rooms") || "[]");

async function joinRoom(rawRoomCode) {
  const roomCode = normalizeRoomCode(rawRoomCode);
  if (!roomCode) {
    setSyncStatus("Codigo invalido.");
    return;
  }

  // Limitar a 2 salas distintas por sesión (evita abrir demasiadas conexiones Firebase)
  if (!openRooms.includes(roomCode)) {
    if (openRooms.length >= 2) {
      setSyncStatus(`Límite de 2 salas alcanzado. Cierra otra pestaña.`);
      logEvent("room", `Bloqueado: ya hay ${openRooms.length} salas abiertas en esta sesión.`);
      return;
    }
    openRooms.push(roomCode);
    sessionStorage.setItem("cine-juntos-open-rooms", JSON.stringify(openRooms));
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
  dom.roomBadge.textContent = `Sala: ${roomCode}`;
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

function sendMessage(text, attachedImage) {
  if (!activeRoom || !transport) {
    setSyncStatus("Primero entra a una sala.");
    logEvent("chat", "Mensaje no enviado: falta sala.");
    return false;
  }

  const message = {
    id: crypto.randomUUID(),
    from: clientId,
    name: getDisplayName(),
    text: text || "",
    image: attachedImage || null,
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
  if ((!message?.text && !message?.image) || lastMessageIds.has(message.id)) return;
  lastMessageIds.add(message.id);
  rememberParticipant(message.from, message.name);

  appendMessageTo(dom.messages, message);
  appendMessageTo(dom.overlayMessages, message);
  const insideChatOpen = dom.playerFrame.classList.contains("chat-inside-open");
  const externalChatOpen = !dom.sessionView.classList.contains("chat-collapsed");

  // Unread del chat interno: solo si el chat interno está cerrado
  if (message.from !== clientId && !insideChatOpen) {
    incrementInsideUnread();
  }
  // Unread del chat externo: solo si el chat externo está cerrado
  if (message.from !== clientId && !externalChatOpen) {
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
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "message-reply";
    reply.innerHTML = `<span class="message-reply-name">${message.replyTo.name || "Invitado"}</span><span class="message-reply-body">${truncateText(message.replyTo.text, 90)}</span>`;
    reply.addEventListener("click", () => scrollToMessage(message.replyTo.id));
    bubble.append(reply);
  }
  
  if (message.text) {
    appendMessageContent(bubble, message.text);
  }

  if (message.image) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = message.image;
    link.target = "_blank";

    const imgElement = document.createElement("img");
    imgElement.className = "message-media";
    imgElement.src = message.image;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    bubble.append(link);
  }

  item.append(meta, bubble);
  if (!message.system) wireMessageInteractions(bubble, message);
  container.append(item);
  trimRenderedMessages(container);

  // Si el usuario está viendo el final del chat → auto-scroll
  // Si no está al final → mostrar el indicador de nuevo mensaje
  const isOverlay = container === dom.overlayMessages;
  const threshold = 120;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromBottom <= threshold || message.from === clientId) {
    container.scrollTop = container.scrollHeight;
  } else if (message.from !== clientId) {
    incrementScrollIndicator(isOverlay);
  }
}

function appendMessageContent(container, text) {
  const trimmedText = String(text || "").trim();
  
  // Si el texto es una imagen en base64 directa, la renderizamos de una
  if (trimmedText.startsWith("data:image/") && trimmedText.includes("base64,")) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = trimmedText;
    link.target = "_blank";

    const img = document.createElement("img");
    img.className = "message-media";
    img.src = trimmedText;
    img.alt = "Imagen base64";
    img.loading = "lazy";

    link.append(img);
    container.append(link);
    return;
  }

  const firstUrl = findFirstUrl(text);
  const explicitImageUrl = parseExplicitImageUrl(text);
  const imageUrl = explicitImageUrl || (firstUrl && isRemoteImageUrl(firstUrl) ? firstUrl : "");
  const videoUrl = firstUrl && isRemoteVideoUrl(firstUrl) ? firstUrl : "";

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
  // Intentamos mostrar como imagen cualquier URL que no sea explicitamente un video.
  // Si el servidor no devuelve una imagen, el listener 'error' lo degrada a link de texto.
  const shouldAttemptImagePreview = Boolean(!videoUrl && firstUrl);
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
      // No se pudo cargar como imagen: mostrar como link de texto normal
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

  if (!document.fullscreenElement) {
    document.body.classList.remove("fullscreen-mode");
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
  const isOverlay = (input === dom.overlayMessageInput);
  const text = input.value.trim();
  const img = isOverlay ? pendingOverlayImage : pendingImage;

  if (!text && !img) return;

  // Bloquear si supera el límite de caracteres
  if (input.value.length > MAX_CHARS) {
    const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
    if (counter) {
      counter.classList.add("char-counter--shake");
      window.setTimeout(() => counter.classList.remove("char-counter--shake"), 500);
    }
    return;
  }

  const wasQueued = sendMessage(text, img);
  if (!wasQueued) return;

  input.value = "";
  updateCharCounter(input, isOverlay);
  if (isOverlay) {
    clearPendingImage(true);
    dom.overlayMessageInput.focus();
  } else {
    clearPendingImage(false);
  }
  autoResizeMessageInput(input);
}

// Maneja el pegado de imágenes desde el portapapeles
function handlePasteEvent(event, isOverlay) {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = (e) => {
        const rawBase64 = e.target.result;
        // Comprimimos localmente en canvas antes de enviarla
        compressImageBase64(rawBase64, 800, 800, 0.7, (compressedBase64) => {
          if (isOverlay) {
            pendingOverlayImage = compressedBase64;
          } else {
            pendingImage = compressedBase64;
          }
          renderImagePreview(isOverlay);
        });
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}

// Comprime la imagen dibujándola en un canvas antes de enviarla
function compressImageBase64(base64Str, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    callback(compressedDataUrl);
  };
}

// Renderiza la vista previa de la imagen pegada
function renderImagePreview(isOverlay) {
  const container = isOverlay ? dom.overlayImagePreview : dom.imagePreview;
  const base64 = isOverlay ? pendingOverlayImage : pendingImage;

  if (!container) return;

  if (!base64) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="preview-box">
      <img src="${base64}" alt="Miniatura de imagen pegada" />
      <button type="button" class="preview-remove-btn" aria-label="Quitar imagen">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  container.querySelector(".preview-remove-btn").addEventListener("click", () => {
    clearPendingImage(isOverlay);
  });
}

// Limpia la imagen pendiente
function clearPendingImage(isOverlay) {
  if (isOverlay) {
    pendingOverlayImage = "";
  } else {
    pendingImage = "";
  }
  renderImagePreview(isOverlay);
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

function setExternalChatCollapsed(collapsed) {
  dom.sessionView.classList.toggle("chat-collapsed", collapsed);
  if (!collapsed) resetExternalUnread();
  updateCollapseButton();
  logEvent("ui", collapsed ? "Chat externo contraido." : "Chat externo expandido.");

  const isFullscreen = document.body.classList.contains("fullscreen-mode") || Boolean(document.fullscreenElement);
  if (isFullscreen) {
    focusFullscreenWorkspace();
  }
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
      container.classList.remove("reply-preview--visible");
      window.setTimeout(() => {
        if (!replyTarget) container.hidden = true;
      }, 200);
      return;
    }

    const replyIcon = document.createElement("span");
    replyIcon.className = "reply-preview-icon";
    replyIcon.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>`;

    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "reply-preview-text";
    textBtn.innerHTML = `<span class="reply-preview-name">${replyTarget.name}</span><span class="reply-preview-body">${truncateText(replyTarget.text || "", 60)}</span>`;
    textBtn.addEventListener("click", () => scrollToMessage(replyTarget.id));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "reply-preview-close";
    close.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>`;
    close.setAttribute("aria-label", "Cancelar respuesta");
    close.addEventListener("click", clearReplyTarget);

    container.append(replyIcon, textBtn, close);
    container.hidden = false;
    // Forzamos reflow para que la transición de entrada funcione
    container.getBoundingClientRect();
    container.classList.add("reply-preview--visible");
  });
}

function wireMessageInteractions(item, message) {
  // Solo swipe de derecha a izquierda (dx negativo) activa reply
  const SWIPE_THRESHOLD = 55;   // desplazamiento visual mínimo para activar
  const SWIPE_MAX_VISUAL = 80;  // límite visual de desplazamiento
  const DIR_LOCK_ANGLE = 30;    // ángulo máximo en grados del movimiento horizontal

  let startX = null;
  let startY = null;
  let tracking = false;   // ¿está haciendo drag activo?
  let dirLocked = false;  // ¿dirección bloqueada como horizontal?
  let cancelledByVertical = false;

  // Ícono hint que aparece al costado
  const hint = document.createElement("span");
  hint.className = "swipe-reply-hint";
  hint.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 17 4 12 9 7'/><path d='M20 18v-2a4 4 0 0 0-4-4H4'/></svg>`;
  item.append(hint);

  function applySwipe(rawDx) {
    // Solo aceptar swipe hacia la izquierda
    if (rawDx >= 0) {
      resetSwipe();
      return;
    }
    const abs = Math.abs(rawDx);
    const damped = SWIPE_MAX_VISUAL * (1 - Math.exp(-abs / SWIPE_MAX_VISUAL));
    const clamped = Math.min(damped, SWIPE_MAX_VISUAL);
    const ratio = clamped / SWIPE_MAX_VISUAL;

    item.style.transition = "none";
    item.style.transform = `translateX(${-clamped}px)`;
    hint.style.opacity = String(Math.min(1, ratio * 2.2));
    hint.style.transform = `translateX(${-clamped * 0.5}px) translateY(-50%) scale(${0.5 + ratio * 0.5})`;
    item.classList.toggle("swipe-ready", clamped >= SWIPE_THRESHOLD);
  }

  function resetSwipe() {
    item.style.transition = "transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    item.style.transform = "";
    hint.style.opacity = "0";
    hint.style.transform = "translateY(-50%) scale(0.5)";
    item.classList.remove("swipe-ready");
    startX = null;
    startY = null;
    tracking = false;
    dirLocked = false;
    cancelledByVertical = false;
  }

  function onStart(clientX, clientY) {
    startX = clientX;
    startY = clientY;
    tracking = true;
    dirLocked = false;
    cancelledByVertical = false;
    longPressStart = { x: clientX, y: clientY, message };
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      if (!dirLocked) showMessageMenu(message, clientX, clientY);
    }, 560);
  }

  function onMove(clientX, clientY) {
    if (!tracking || cancelledByVertical) return;

    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!dirLocked) {
      if (Math.abs(dy) > Math.abs(dx) + 5) {
        // Gesto vertical → cancelar todo el swipe
        cancelledByVertical = true;
        window.clearTimeout(longPressTimer);
        tracking = false;
        return;
      }
      if (Math.abs(dx) > 10) {
        // Solo hacia la izquierda
        if (dx > 0) {
          cancelledByVertical = true;
          tracking = false;
          return;
        }
        dirLocked = true;
        longPressStart = null;
        window.clearTimeout(longPressTimer);
      } else {
        return; // No se decidió aún la dirección
      }
    }

    applySwipe(dx);
  }

  function onEnd(clientX) {
    window.clearTimeout(longPressTimer);
    if (!tracking || !dirLocked) {
      longPressStart = null;
      return;
    }

    const dx = clientX - startX;
    const abs = Math.abs(dx);
    const damped = SWIPE_MAX_VISUAL * (1 - Math.exp(-abs / SWIPE_MAX_VISUAL));

    if (dx < 0 && damped >= SWIPE_THRESHOLD) {
      // Rebote de confirmación
      item.style.transition = "transform 0.12s ease-out";
      item.style.transform = `translateX(-14px)`;
      window.setTimeout(() => {
        resetSwipe();
        setReplyTarget(message);
      }, 130);
    } else {
      resetSwipe();
    }
  }

  // ── Pointer events (mouse / stylus) ──────────────────────────────
  item.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMessageMenu(message, e.clientX, e.clientY);
  });

  item.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // Touch lo manejan los touch events
    if (e.button && e.button !== 0) return;
    onStart(e.clientX, e.clientY);
  });

  item.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    if (!tracking) return;
    onMove(e.clientX, e.clientY);
  });

  item.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") return;
    onEnd(e.clientX);
  });

  item.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") return;
    window.clearTimeout(longPressTimer);
    longPressStart = null;
    resetSwipe();
  });

  // ── Touch events (móvil / tablet) ────────────────────────────────
  item.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
  }, { passive: true });

  item.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (!tracking) return;
    const dx = t.clientX - startX;
    // Si está en medio de un swipe horizontal, prevenir scroll nativo
    if (dirLocked && dx < 0) e.preventDefault();
    onMove(t.clientX, t.clientY);
  }, { passive: false });

  item.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    onEnd(t.clientX);
  }, { passive: true });

  item.addEventListener("touchcancel", () => {
    window.clearTimeout(longPressTimer);
    longPressStart = null;
    resetSwipe();
  }, { passive: true });
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

// ─── Scroll-to-message (citas clickeables) ──────────────────────────────────

function scrollToMessage(messageId) {
  if (!messageId) return;
  const containers = [dom.messages, dom.overlayMessages];
  for (const container of containers) {
    const target = container.querySelector(`article[data-message-id="${messageId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightMessage(target);
      return;
    }
  }
}

function highlightMessage(element) {
  element.classList.remove("message-highlight");
  // Forzar reflow para reiniciar la animación
  void element.offsetWidth;
  element.classList.add("message-highlight");
  window.setTimeout(() => {
    element.classList.remove("message-highlight");
  }, 2600);
}

// ─── Indicador de mensajes nuevos (flecha flotante) ─────────────────────────

let mainScrollUnread = 0;
let overlayScrollUnread = 0;

function checkScrollPosition(isOverlay) {
  const container = isOverlay ? dom.overlayMessages : dom.messages;
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const threshold = 80;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  if (distanceFromBottom <= threshold) {
    // El usuario llegó al final → ocultar y resetear
    resetScrollIndicator(isOverlay);
  }
}

function incrementScrollIndicator(isOverlay) {
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

  if (isOverlay) {
    overlayScrollUnread++;
    badge.textContent = overlayScrollUnread > 99 ? "99+" : String(overlayScrollUnread);
  } else {
    mainScrollUnread++;
    badge.textContent = mainScrollUnread > 99 ? "99+" : String(mainScrollUnread);
  }

  const count = isOverlay ? overlayScrollUnread : mainScrollUnread;
  badge.hidden = count === 0;
  btn.hidden = false;
  btn.classList.add("scroll-bottom-btn--visible");
}

function resetScrollIndicator(isOverlay) {
  const btn = isOverlay ? dom.overlayScrollBottomBtn : dom.mainScrollBottomBtn;
  const badge = isOverlay ? dom.overlayScrollBadge : dom.mainScrollBadge;

  if (isOverlay) {
    overlayScrollUnread = 0;
  } else {
    mainScrollUnread = 0;
  }

  badge.textContent = "0";
  badge.hidden = true;
  btn.classList.remove("scroll-bottom-btn--visible");
  window.setTimeout(() => {
    if (!btn.classList.contains("scroll-bottom-btn--visible")) {
      btn.hidden = true;
    }
  }, 300);
}

// ─── Contador de caracteres y validación ────────────────────────────────────

const MAX_CHARS = 1500;

function updateCharCounter(input, isOverlay) {
  const counter = isOverlay ? dom.overlayCharCounter : dom.mainCharCounter;
  const form = isOverlay ? dom.overlayMessageForm : dom.messageForm;
  const sendBtn = isOverlay ? dom.overlayMessageSend : dom.mainMessageSend;
  const len = input.value.length;
  const remaining = MAX_CHARS - len;

  if (counter) {
    counter.textContent = `${len} / ${MAX_CHARS}`;
  }

  const isOver = len > MAX_CHARS;
  form.classList.toggle("over-limit", isOver);
  if (sendBtn) {
    sendBtn.disabled = isOver;
    sendBtn.setAttribute("aria-disabled", String(isOver));
  }
}

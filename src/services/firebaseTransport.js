import { FIREBASE_VERSION, MAX_ROOM_PARTICIPANTS, STALE_MEMBER_TIMEOUT_MS } from "../core/utils.js";
import { state, makeMemberPayload, logEvent } from "../core/state.js?v=20260902-mobile-real-browser-01";

export async function createFirebaseTransport(roomCode, config) {
  const [appModule, authModule, dbModule] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
  ]);

  const app = appModule.getApps().length ? appModule.getApps()[0] : appModule.initializeApp(config);
  const auth = authModule.getAuth(app);
  if (!auth.currentUser) {
    await auth.authStateReady?.();
  }
  if (!auth.currentUser) {
    await authModule.signInAnonymously(auth);
  }

  const db = dbModule.getDatabase(app);
  const roomPath = `rooms/${roomCode}`;
  const stateRef = dbModule.ref(db, `${roomPath}/state`);
  const messagesRef = dbModule.ref(db, `${roomPath}/messages`);
  const membersRef = dbModule.ref(db, `${roomPath}/members`);
  const memberRef = dbModule.ref(db, `${roomPath}/members/${state.session.clientId}`);
  const roomRef = dbModule.ref(db, roomPath);
  const serverTimeOffsetRef = dbModule.ref(db, ".info/serverTimeOffset");
  const unsubscribers = [];
  let heartbeat = null;
  let serverTimeOffset = 0;
  let lastMembers = {};
  let roomDisconnectCleanupScheduled = false;
  let roomDisconnectTask = Promise.resolve();
  let closePromise = null;
  let closed = false;
  const latestMessagesQuery = dbModule.query(messagesRef, dbModule.limitToLast(100));

  const getActiveMembers = (members, now = Date.now() + serverTimeOffset) => {
    const activeMembers = {};
    Object.entries(members || {}).forEach(([memberId, member]) => {
      if (Number.isFinite(member?.lastSeenAt) && now - member.lastSeenAt >= STALE_MEMBER_TIMEOUT_MS) return;
      activeMembers[memberId] = member;
    });
    return activeMembers;
  };

  const configureRoomDisconnectCleanup = async (shouldSchedule) => {
    if (roomDisconnectCleanupScheduled === shouldSchedule) return;

    if (shouldSchedule) {
      await dbModule.onDisconnect(roomRef).remove();
    } else {
      await dbModule.onDisconnect(roomRef).cancel();
    }
    roomDisconnectCleanupScheduled = shouldSchedule;
  };

  const queueRoomDisconnectCleanup = (members) => {
    const shouldSchedule = Object.keys(members || {}).length === 1
      && Boolean(members[state.session.clientId]);

    roomDisconnectTask = roomDisconnectTask
      .then(() => {
        if (closed) return undefined;
        return configureRoomDisconnectCleanup(shouldSchedule);
      })
      .catch(() => {});
    return roomDisconnectTask;
  };

  const runRoomTransaction = async (update) => {
    // Firebase puede invocar el callback con null antes de hidratar un nodo
    // que no tiene un listener permanente. Mantener este listener durante la
    // transacción garantiza que la decisión se tome sobre el valor real.
    let unsubscribe = null;
    const firstSnapshot = new Promise((resolve, reject) => {
      unsubscribe = dbModule.onValue(roomRef, resolve, reject);
    });

    try {
      await firstSnapshot;
      return await dbModule.runTransaction(roomRef, update, { applyLocally: false });
    } finally {
      unsubscribe?.();
    }
  };

  const removeRoomIfEmpty = async () => {
    const result = await runRoomTransaction(
      (currentRoom) => {
        if (!currentRoom) return;

        // La transacción vuelve a comprobar members al momento de confirmar.
        // Así una entrada concurrente no puede quedar borrada por esta limpieza.
        if (Object.keys(currentRoom.members || {}).length > 0) return;
        return null;
      },
    );

    if (result.committed) {
      logEvent("firebase", "Sala vacia detectada. Limpiando datos residuales.");
    }
  };

  const cleanupOrphanedRoom = async () => {
    const roomSnapshot = await dbModule.get(roomRef).catch(() => null);
    if (!roomSnapshot?.exists()) return;

    const activeMembers = getActiveMembers(roomSnapshot.child("members").val());
    if (Object.keys(activeMembers).length > 0) return;

    const result = await runRoomTransaction(
      (currentRoom) => {
        if (!currentRoom) return;
        if (Object.keys(getActiveMembers(currentRoom.members)).length > 0) return;
        return null;
      },
    );

    if (result.committed) {
      logEvent("firebase", "Sala huerfana detectada al entrar. Limpiando datos residuales.");
    }
  };

  return {
    mode: "firebase",
    async connect(handlers) {
      const deliverMessage = (snapshot) => {
        const message = { id: snapshot.key, ...snapshot.val() };
        handlers.onMessage?.(message);
      };
      try {
        const serverTimeOffsetSnapshot = await dbModule.get(serverTimeOffsetRef).catch(() => null);
        serverTimeOffset = Number(serverTimeOffsetSnapshot?.val()) || 0;
        await cleanupOrphanedRoom();

        // Registrar el historial después de limpiar una sala huérfana evita que
        // mensajes de una sesión anterior lleguen a pintarse en el reingreso.
        // Se registra antes de esperar la transacción de presencia.
        unsubscribers.push(dbModule.onChildAdded(latestMessagesQuery, deliverMessage));
        void dbModule.get(latestMessagesQuery)
          .then((snapshot) => snapshot.forEach((child) => deliverMessage(child)))
          .catch(() => {});

        const joinResult = await dbModule.runTransaction(
          membersRef,
          (currentMembers) => {
            const members = getActiveMembers(currentMembers);
            const participantCount = Object.keys(members).length;
            if (!members[state.session.clientId] && participantCount >= MAX_ROOM_PARTICIPANTS) {
              return;
            }
            return {
              ...members,
              [state.session.clientId]: makeMemberPayload(),
            };
          },
          { applyLocally: false },
        );

        if (!joinResult.committed) {
          const roomFullError = new Error("Sala completa.");
          roomFullError.code = "ROOM_FULL";
          throw roomFullError;
        }

        lastMembers = getActiveMembers(joinResult.snapshot?.val() || {});
        // Esperar esta operación es importante: si la pestaña se cierra justo
        // después de entrar, Firebase debe alcanzar a registrar la limpieza.
        await dbModule.onDisconnect(memberRef).remove();
        await configureRoomDisconnectCleanup(
          Object.keys(lastMembers).length === 1 && Boolean(lastMembers[state.session.clientId]),
        ).catch(() => {});
      } catch (error) {
        const wrapped = new Error(error?.message || "No se pudo escribir en members.");
        wrapped.code = error?.code || "FIREBASE_PERMISSION_DENIED";
        throw wrapped;
      }

      handlers.onConnection?.("firebase", "Firebase conectado");
      logEvent("firebase", "Sesion anonima conectada.");

      unsubscribers.push(
        dbModule.onValue(serverTimeOffsetRef, (snapshot) => {
          serverTimeOffset = Number(snapshot.val()) || 0;
          logEvent("firebase", `Offset de tiempo: ${Math.round(serverTimeOffset)} ms.`);
        }),
      );

      unsubscribers.push(
        dbModule.onValue(stateRef, (snapshot) => {
          if (snapshot.exists()) handlers.onState?.(snapshot.val());
        }),
      );

      unsubscribers.push(
        dbModule.onValue(membersRef, (snapshot) => {
          const val = snapshot.val() || {};
          const activeMembers = getActiveMembers(val);
          const staleMemberIds = [];

          Object.entries(val).forEach(([memberId, member]) => {
            if (!activeMembers[memberId]) {
              staleMemberIds.push(memberId);
            }
          });

          staleMemberIds.forEach((memberId) => {
            dbModule.remove(dbModule.ref(db, `${roomPath}/members/${memberId}`)).catch(() => {});
          });

          lastMembers = activeMembers;
          void queueRoomDisconnectCleanup(activeMembers);
          if (!snapshot.exists() || Object.keys(activeMembers).length === 0) {
            void removeRoomIfEmpty().catch(() => {});
          }
          handlers.onMembers?.(activeMembers);
        }),
      );

      heartbeat = window.setInterval(() => {
        dbModule.set(memberRef, makeMemberPayload()).catch(() => {});
      }, 10000);
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
      if (closePromise) return closePromise;

      const hasOtherMembers = Object.keys(lastMembers).some(
        (memberId) => memberId !== state.session.clientId,
      );
      closed = true;
      if (heartbeat) window.clearInterval(heartbeat);
      unsubscribers.forEach((unsubscribe) => unsubscribe());

      // Si había otro participante, no dejar una eliminación de sala pendiente
      // para nuestro desconectado. Si éramos el último, mantenerla para que
      // también cubra el cierre abrupto de la pestaña.
      roomDisconnectTask = roomDisconnectTask
        .then(() => configureRoomDisconnectCleanup(!hasOtherMembers))
        .catch(() => {});

      closePromise = roomDisconnectTask
        .then(() => dbModule.remove(memberRef))
        .then(() => removeRoomIfEmpty())
        .catch((error) => {
          console.warn("Error al verificar limpieza al salir:", error);
        });
      return closePromise;
    },
  };
}

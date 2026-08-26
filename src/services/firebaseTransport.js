import { FIREBASE_VERSION, MAX_ROOM_PARTICIPANTS, STALE_MEMBER_TIMEOUT_MS } from "../core/utils.js";
import { state, makeMemberPayload, logEvent } from "../core/state.js";

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
  const latestMessagesQuery = dbModule.query(messagesRef, dbModule.limitToLast(100));

  return {
    mode: "firebase",
    async connect(handlers) {
      // El historial del chat no debe esperar a que termine la transacción de
      // presencia. Esa transacción puede tardar varios segundos al reconectar.
      const deliverMessage = (snapshot) => {
        const message = { id: snapshot.key, ...snapshot.val() };
        handlers.onMessage?.(message);
      };
      unsubscribers.push(dbModule.onChildAdded(latestMessagesQuery, deliverMessage));
      // En una conexión nueva, el primer evento del websocket puede tardar
      // mientras se negocia la sesión de RTDB. La lectura paralela permite
      // pintar el historial por la ruta HTTP disponible antes, y el Set de
      // ids del render evita duplicados cuando llegue también onChildAdded.
      void dbModule.get(latestMessagesQuery)
        .then((snapshot) => snapshot.forEach((child) => deliverMessage(child)))
        .catch(() => {});
      try {
        const existingMembersSnap = await dbModule.get(membersRef).catch(() => null);
        if (existingMembersSnap !== null && !existingMembersSnap.exists()) {
          const existingRoomSnap = await dbModule.get(roomRef).catch(() => null);
          if (existingRoomSnap?.exists()) {
            logEvent("firebase", "Sala huerfana detectada al entrar. Limpiando datos residuales.");
            await dbModule.remove(roomRef).catch(() => {});
          }
        }

        const joinResult = await dbModule.runTransaction(
          membersRef,
          (currentMembers) => {
            const members = currentMembers || {};
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

        dbModule.onDisconnect(memberRef).remove().catch(() => {});
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
          const now = Date.now() + serverTimeOffset;
          const activeMembers = {};
          const staleMemberIds = [];

          Object.entries(val).forEach(([memberId, member]) => {
            if (Number.isFinite(member?.lastSeenAt) && now - member.lastSeenAt >= STALE_MEMBER_TIMEOUT_MS) {
              staleMemberIds.push(memberId);
              return;
            }
            activeMembers[memberId] = member;
          });

          staleMemberIds.forEach((memberId) => {
            dbModule.remove(dbModule.ref(db, `${roomPath}/members/${memberId}`)).catch(() => {});
          });

          const membersList = Object.keys(activeMembers);

          if (!snapshot.exists() || membersList.length === 0) {
            logEvent("firebase", "Sala vacia detectada. Limpiando datos residuales.");
            dbModule.remove(roomRef).catch(() => {});
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
      if (heartbeat) window.clearInterval(heartbeat);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      dbModule.remove(memberRef).then(async () => {
        try {
          const snap = await dbModule.get(membersRef);
          if (!snap.exists() || Object.keys(snap.val() || {}).length === 0) {
            logEvent("firebase", "Limpiando sala vacia al salir.");
            await dbModule.remove(roomRef);
          }
        } catch (error) {
          console.warn("Error al verificar limpieza al salir:", error);
        }
      }).catch(() => {});
    },
  };
}

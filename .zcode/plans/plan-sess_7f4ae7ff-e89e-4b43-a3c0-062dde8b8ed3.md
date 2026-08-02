## Plan: Agrupar features en carpetas + renombrar archivos

### 1. Mover archivos a carpetas

**`features/chat/`** (12 archivos):
```
features/chat/index.js                ← features/chat.js (rename)
features/chat/chat-render.js         ← features/chat-render.js (mover)
features/chat/chat-reply.js           ← features/chat-reply.js (mover)
features/chat/chat-system-messages.js ← features/chat-system-messages.js (mover)
features/chat/chat-input.js           ← features/chat-input.js (mover)
features/chat/chat-message-interactions.js ← features/chat-message-interactions.js (mover)
features/chat/swipe-reply.js          ← features/swipe-reply.js (mover)
features/chat/message-menu.js         ← features/message-menu.js (mover)
features/chat/chat-layout.js          ← features/chat-layout.js (mover)
features/chat/chat-content-parser.js   ← features/chat-message-content.js (mover + rename)
features/chat/image-compress.js       ← features/image-utils.js (mover + rename)
features/chat/unread-counters.js      ← features/unread-counters.js (mover)
```

**`features/player/`** (4 archivos):
```
features/player/index.js              ← features/playerSync.js (rename)
features/player/player.js             ← features/player.js (mover)
features/player/player-sync-logic.js  ← features/player-sync-logic.js (mover)
features/player/fullscreen.js         ← features/fullscreen.js (mover)
```

**Se quedan en `features/`** (4 archivos sueltos):
```
features/icons-tooltips.js            ← features/ui.js (rename)
features/room.js                      ← (sin cambios)
features/session-ui.js                ← (sin cambios)
features/presence.js                  ← (sin cambios)
```

### 2. Renombrados

| Archivo viejo | Nuevo nombre | Motivo |
|---|---|---|
| `chat.js` → `chat/index.js` | Convención estándar de JS: index.js es el barrel/entrada de la carpeta |
| `playerSync.js` → `player/index.js` | Idem |
| `ui.js` → `icons-tooltips.js` | Describe lo que hace (iconos + tooltips), no el genérico "ui" |
| `image-utils.js` → `image-compress.js` | "utils" es vago; el archivo hace compresión y preview de imágenes |
| `chat-message-content.js` → `chat-content-parser.js` | Describe la acción (parsear URLs, imágenes, videos) |

### 3. Actualizar imports (~15 archivos afectados)

**Regla general para archivos dentro de chat/ y player/:**
- `../core/` → `../../core/` (suben un nivel más)
- `../state/` → `../../state/` (ídem)
- `./presence.js` → `../presence.js` (archivos sueltos suben un nivel)
- `./ui.js` → `../icons-tooltips.js` (rename + sube nivel)
- `./session-ui.js` → `../session-ui.js` (sube nivel)

**Archivos dentro de chat/ que importan otros chat/ → sin cambio** (siguen siendo `./nombre.js`).

**main.js (en src/ raíz):**
- `./features/chat.js` → `./features/chat/index.js` (o `./features/chat/`)
- `./features/playerSync.js` → `./features/player/index.js`
- `./features/ui.js` → `./features/icons-tooltips.js`

**Archivos sueltos en features/ (room.js, session-ui.js, presence.js, icons-tooltips.js):**
- `./chat.js` → `./chat/index.js`
- `./playerSync.js` → `./player/index.js`
- `./ui.js` → `./icons-tooltips.js` (si session-ui.js lo importa)
- `./presence.js`, `./session-ui.js` → sin cambio

**Dependencia cruzada chat↔player:**
- `player/player-sync-logic.js` importa `sendVideoEventMessage` de `chat/index.js` → nuevo path: `../chat/index.js`
- `player/fullscreen.js` no importa de chat → sin cambio de grupo

### 4. Verificación

- `node --check` en TODOS los archivos JS de `src/`
- Script de verificación cruzada de imports nombrados
- Actualizar `MAPA_ARQUITECTURA_PRAGMATICA.txt`

### 5. Orden de ejecución

1. Crear carpetas `features/chat/` y `features/player/`
2. Mover archivos (git mv) a sus carpetas nuevas
3. Renombrar los 5 archivos que cambian de nombre
4. Actualizar imports en cada archivo afectado
5. Validar con `node --check` + verificación cruzada
6. Actualizar mapa de arquitectura
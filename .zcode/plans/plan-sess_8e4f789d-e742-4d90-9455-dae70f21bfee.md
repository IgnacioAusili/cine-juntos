## Rediseño del header de sala (`.session-toolbar`) al estilo "Broadcast Console"

Scope: **solo el header de la sala** (`session-toolbar` dentro de `session-view`). No se toca el topbar, el lobby, el reproductor, el chat ni los diálogos.

### Diseño objetivo (basado en la referencia)
Cabecera oscura, compacta, de **dos filas** dentro de la tarjeta `session-toolbar`:

- **Fila 1 (identidad + estado):**
  - Izquierda → punto naranja pulsante + nombre de la sala (el código, ej. `1Z5J6`).
  - Derecha → indicador de estado del video (el `#syncStatus` existente con icono + texto: *Sin contenido / Cargando / En vivo / Error*), reformateado como "chip" compacto. *(La referencia muestra un botón "SOS Host" ahí, pero la app no tiene feature de SOS — no voy a inventarlo. El estado de video es el equivalente natural y ya existe.)*
- **Fila 2 (carga de video):**
  - Input de URL monospace oscuro (el `#videoUrlInput` existente) + botón **Cargar** con gradiente de acento (el `#loadVideoButton` existente).
- Se elimina el bloque `.session-toolbar-copy` actual (eyebrow *“Control de video”*, título *“Pista compartida”* y descripción). Es puramente decorativo y **no tiene acoplamiento en JS** (verificado), y la referencia no lo tiene.

### Cambios concretos

**1. `index.html` (líneas ~189–244)** — reescribir el `<section class="session-toolbar">`:
- Quitar `.session-toolbar-copy`, `.session-toolbar-eyebrow/title/description`.
- Quitar el label “Video” + help-button (la referencia va sin label; el input ya tiene `placeholder` y `title`).
- Nueva estructura (conservando los IDs funcionales intactos):
  ```html
  <section class="session-toolbar">
    <div class="session-toolbar-head">
      <div class="session-toolbar-room">
        <span class="session-toolbar-room-dot" aria-hidden="true"></span>
        <span class="session-toolbar-room-name" id="sessionRoomBadge">Sin sala</span>
      </div>
      <p id="syncStatus" class="sync-status video-status empty" ...>
        <span class="video-status-icon" id="videoStatusIcon" ...></span>
        <span id="videoStatusText">Sin contenido</span>
      </p>
    </div>
    <div class="session-toolbar-body">
      <input id="videoUrlInput" type="url" ... placeholder="https://servidor.com/video.mp4" ... />
      <button class="button primary" id="loadVideoButton" type="button" ...>
        <span data-lucide="play-square"></span> Cargar
      </button>
    </div>
  </section>
  ```
  Mantengo `data-tooltip`, `title`, `aria-label`, `type`, CSP-compliant attrs y los `data-lucide` exactos que ya usa la app.

**2. `public/styles/layout/form-layout.css` (líneas ~99–190)** — reemplazar el bloque `.session-toolbar*`:
- `.session-toolbar` → contenedor de **una columna**, padding compacto (~10–12px), `gap`, fondo `--glass-bg` con `--glass-border`, radio `--radius-md`. Sigue aprovechando el `::before` de `panels.css`.
- `.session-toolbar-head` → flex space-between, centrado, gap.
- `.session-toolbar-room` → flex, gap, alinea el punto + nombre.
- `.session-toolbar-room-dot` → círculo de acento con `@keyframes` pulse (glow `--amber-glow`), reutilizando tokens existentes.
- `.session-toolbar-room-name` → peso 600, letter-spacing sutil, uppercase.
- `.session-toolbar .sync-status` → chip compacto a la derecha (mantiene las clases `empty/loading/loaded/error` que ya pinta `player.js`).
- `.session-toolbar-body` → flex, gap, input flexible + botón fijo.
- Input monospace oscuro (`font-family` mono vía stack, fondo `rgba(0,0,0,0.35)`), focus ring de acento.
- Botón con gradiente `--accent → amber-soft` y glow en hover.
- Elimino las reglas muertas: `.session-toolbar-copy/eyebrow/title/description`, `.session-toolbar .field`, `.input-with-button`.

**3. `public/styles/layout/session-layout.css` (líneas 8–19)** — ajustar la base de `.session-toolbar` para que sea **1 columna** y ancho consistente (quitar `grid-template-columns: 1fr` heredado que ya choca; dejar `display:flex; flex-direction:column`).

**4. `public/styles/responsive.css`** — actualizar los breakpoints del toolbar:
- `<= 1100px`: ya no hay segunda columna que colapsar (queda simplificado).
- `<= 480px` (o aprovechar el `680px` existente): apilar input y botón en columna (como la referencia en móvil).

**5. `src/core/dom.js`** — agregar una línea al map `dom`:
```js
sessionRoomBadge: document.querySelector("#sessionRoomBadge"),
```

**6. `src/features/room.js`** — después de la línea 195 (`dom.roomBadge.textContent = roomCode;`), espejar el código en el nuevo elemento:
```js
dom.roomBadge.textContent = roomCode;
if (dom.sessionRoomBadge) dom.sessionRoomBadge.textContent = roomCode;
```
(guard con `if` por si el elemento no existiera en algún contexto, mismo estilo defensivo que usa el resto del código).

### Qué NO cambia
- Topbar, lobby, reproductor, chat (dentro y fuera del video), diálogos, presence, emojis.
- IDs y clases funcionales (`#videoUrlInput`, `#loadVideoButton`, `#syncStatus`, `#videoStatusText`, `#videoStatusIcon`) — se conservan para que `player.js`, `player-sync-logic.js` y `appState.js` sigan funcionando sin tocarlos.
- La lógica de `setVideoStatus` en `player.js` (sigue escribiendo `className`, `textContent` y el icono lucide sobre los mismos elementos).

### Notas / decisiones de diseño
- **No invento el botón “SOS Host”** de la referencia porque la app no tiene esa funcionalidad; en su lugar el indicador de estado de video ocupa ese lugar a la derecha de la fila 1.
- **Punto siempre pulsante** mientras se muestra la sesión (coincide con la referencia; no lo amarro a estado de conexión para no ampliar scope).
- Reutilizo tokens (`--accent`, `--amber-glow`, `--glass-bg`, `--glass-border`, `--radius-md`) para que armonice con el resto y no introduzca una paleta nueva.
- Cache-bust: el `index.html` carga `public/styles.css` (sin `?v=`), pero los CSS modulares se cargan vía `public/styles.css`. Confirmaré cómo se ensambla para ver si hace falta bump de versión — lo verificaré al implementar.

### Verificación
- Abrir la app, crear/entrar a una sala → el header debe mostrar el código en fila 1 con punto pulsante, y el estado a la derecha.
- Pegar una URL válida → botón carga, el `#syncStatus` cambia a *Cargando* → *En vivo*.
- Pegar URL inválida → estado *Error* sin romper.
- Probar en ancho <= 680px y <= 480px → input + botón se apilan bien.
- Confirmar que `roomBadge` del topbar sigue mostrando el código igual que antes.
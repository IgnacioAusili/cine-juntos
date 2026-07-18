# Cine Juntos

## Indice

- `index.html`: estructura base de la pagina.
- `public/`: estilos globales, modulos CSS y archivos de runtime.
- `src/main.js`: punto de entrada e inicializacion.
- `src/core/`: utilidades, DOM y compatibilidad de estado.
- `src/state/`: estado global de la aplicacion.
- `src/features/`: logica por dominio como chat, player, sala y presencia.
- `src/services/`: transporte en tiempo real y fallback local.
- `scripts/` y `docs/`: desarrollo local y documentacion del proyecto.

## Objetivo

Crear una pagina web estatica para ver videos sincronizados con otra persona en una sala compartida. La experiencia principal debe ser directa: entrar con nombre y codigo de sala, cargar un enlace directo de video, ver el reproductor grande y chatear en tiempo real.

## Herramientas

- HTML, CSS y JavaScript sin framework.
- Firebase preparado para comunicacion en tiempo real cuando exista configuracion valida.
- Modo local como fallback cuando no hay credenciales de Firebase.
- Iconos desde CDN con Lucide.
- Servidor local de desarrollo con `scripts/dev-server.js`.

## Arquitectura

La app sigue una arquitectura simple y modular en JavaScript vanilla. El punto de entrada es `src/main.js`, que coordina la inicializacion general, conecta la UI y pone a trabajar los modulos del proyecto.

- `src/state/appState.js` concentra el estado global en cuatro bloques: `session`, `player`, `chat` y `ui`.
- `src/core/` contiene utilidades neutras, referencias DOM y el puente `state.js` para mantener compatibilidad de imports.
- `src/features/` agrupa la logica por dominio:
  - `chat/` maneja render, input, replies, menu contextual, layout y contadores.
  - `player/` maneja eventos del video, fullscreen y sincronizacion.
  - archivos como `room.js`, `presence.js` y `session-ui.js` resuelven coordinacion de sala, presencia e interfaz de sesion.
- `src/services/` abstrae el transporte en tiempo real con dos caminos: Firebase cuando hay configuracion valida y modo local como fallback.
- `public/styles/` divide el CSS por capas y areas de UI, con `public/styles.css` como entrada principal.

La idea general es separar responsabilidades sin meter frameworks ni refactors grandes: estado centralizado, modulos por feature y servicios aislados para no mezclar logica de interfaz con sincronizacion o transporte.

## Funcionamiento

- Cada sala sincroniza mensajes, presencia, video cargado y eventos de reproduccion.
- El video se carga desde enlaces directos compatibles con el reproductor HTML5.
- Los eventos de play, pausa, seek, velocidad y carga de video se publican en la sala y tambien se reflejan como mensajes de sistema en el chat.
- El chat externo y el chat interno del reproductor son dos vistas del mismo chat y pueden estar visibles al mismo tiempo.
- El chat renderiza enlaces clickeables, imagenes, GIFs y videos remotos cuando el mensaje contiene una URL compatible.
- Para evitar crecimiento indefinido, la interfaz conserva hasta 100 mensajes renderizados.


## Tener en cuenta

- Priorizar cambios acotados en pasos
- Mantener logs tecnicos en consola o terminal
- Si consideras necesario validar cambios con `node --check src/main.js` y se puede revisar visualmente en `http://127.0.0.1:8080` levantado el servidor, aunque es preferible evitarlo.
- Si un fix ya esta en `main` pero GitHub Pages sigue cargando una version vieja, actualizar el query param `?v=` en `index.html` para forzar cache-busting.
-  las clases no deben superar nunca las 200 lineas, si estas modificando una clase y notas que supera ese limite, decime que habria que refactorizarla al terminar tu trabajo.

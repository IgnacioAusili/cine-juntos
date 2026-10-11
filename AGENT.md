# Cine Juntos

## Indice

- `src/index.template.html` y los parciales `src/features/*/*.html`: fuentes del marcado estatico.
- `index.html`: salida generada para el hosting estatico; no editar directamente.
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
- `scripts/build-html.js` ensambla el template y sus parciales antes del despliegue; el servidor local observa cambios HTML y actualiza la salida.

La idea general es separar responsabilidades sin meter frameworks ni refactors grandes: estado centralizado, modulos por feature y servicios aislados para no mezclar logica de interfaz con sincronizacion o transporte.

## CSS: ITCSS, BEM y OOCSS

- `public/styles.css` es el punto de entrada y expresa el orden ITCSS del proyecto: tokens/configuracion, estilos genericos, objetos de layout, componentes, estados/responsive y overrides finales. Mantener el orden existente de imports porque forma parte de la cascada.
- Para clases de componentes nuevas o que se migren, usar BEM: bloque independiente (`button`), elemento interno con `__` (`button__label`) y modificador con `--` (`button--primary`). El modificador se combina con la clase del bloque.
- Dentro de cada archivo, agrupar las reglas por componente y usar secciones para base, elementos, variantes, estados y ajustes responsive. Mantener las variables CSS al inicio del archivo.
- Usar OOCSS para separar estructura reutilizable de apariencia cuando la cohesión lo justifique; `button-layout.css` y `button-skin.css` son un ejemplo, no una obligación para cada componente.
- Al agregar o cambiar una clase, actualizar juntos CSS, HTML fuente y JavaScript, incluidos templates HTML generados dinámicamente.
- El componente `button` ya usa modificadores BEM para sus variantes primaria, de advertencia y destructiva: `.button--primary`, `.button--warning` y `.button--danger`. Mantener la clase `.button` junto al modificador y no reintroducir aliases como `.button.primary`.
- Los controles del reproductor usan `.video-control-button--primary` junto al bloque `.video-control-button`.
- Pantalla completa y el mini reproductor expresan su estado con `.video-control-button--active` junto a `.video-control-button`.
- El selector de estilo del chat usa `.chat-style-toggle__button` y el modificador `.chat-style-toggle__button--active`; su estado se sincroniza también en el espejo del mini reproductor.
- El control de chat del reproductor usa `.player-chat-toggle` y `.player-chat-toggle--active`; JavaScript aplica el mismo modificador en el espejo del mini reproductor.
- El contador de cooldown del chat usa `.icon-button__send-cooldown` dentro del bloque `.icon-button`.
- El switch de autoexpansión usa `.chat-auto-switch__track`, `.chat-auto-switch__thumb` y `.chat-auto-switch--active`; JavaScript mantiene su estado en el mini reproductor.
- La skin activa de `.icon-button` combina bloque y modificador en `.icon-button.icon-button--active`; no reintroducir el alias `.icon-button.active`, retirado por falta de consumidores.
- Migración completa: 372 nombres heredados se consolidaron en 367 destinos; no quedan referencias a nombres previos. La asignación de las 129 hojas y el mapa de clases están en `docs/MAPA_ITCSS_CSS.csv` y `docs/MAPA_CLASES_CSS.csv`; el contrato está en `docs/CONTRATO_CSS_ITCSS_BEM.md`.
- Para cambios nuevos, mantener BEM/ITCSS/OOCSS y revisar imports, cache-burst y la interacción principal del dominio afectado.
- Mantener los modulos CSS cohesivos y revisar toda su cadena de `@import` y cache-burst al modificarlos.

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
- Si un fix ya esta en `main` pero GitHub Pages sigue cargando una version vieja, actualizar el query param `?v=` en `src/index.template.html` para forzar cache-busting y regenerar `index.html`.
- Los archivos propios de JavaScript, CSS y HTML deben apuntar a menos de 300 lineas. Entre 300 y 400, mantenerlos solo si dividirlos perjudica la cohesion y documentar el motivo; por encima de 400, dividir salvo necesidad clara y documentada. Documentacion, configuracion, vendor y archivos generados quedan fuera del limite. `index.html` es salida generada y puede superar ese limite; sus fuentes HTML deben seguir por debajo de 300 lineas.

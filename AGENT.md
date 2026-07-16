# Cine Juntos

## Objetivo

Crear una pagina web estatica para ver videos sincronizados con otra persona en una sala compartida. La experiencia principal debe ser directa: entrar con nombre y codigo de sala, cargar un enlace directo de video, ver el reproductor grande y chatear en tiempo real.

## Herramientas

- HTML, CSS y JavaScript sin framework.
- Firebase preparado para comunicacion en tiempo real cuando exista configuracion valida.
- Modo local como fallback cuando no hay credenciales de Firebase.
- Iconos desde CDN con Lucide.
- Servidor local de desarrollo con `scripts/dev-server.js`.

## Funcionamiento

- Cada sala sincroniza mensajes, presencia, video cargado y eventos de reproduccion.
- El video se carga desde enlaces directos compatibles con el reproductor HTML5.
- Los eventos de play, pausa, seek, velocidad y carga de video se publican en la sala y tambien se reflejan como mensajes de sistema en el chat.
- El chat externo y el chat interno del reproductor son dos vistas del mismo chat y pueden estar visibles al mismo tiempo.
- El chat renderiza enlaces clickeables, imagenes, GIFs y videos remotos cuando el mensaje contiene una URL compatible.
- Para evitar crecimiento indefinido, la interfaz conserva hasta 100 mensajes renderizados.

## Preferencias de interfaz

- Interfaz oscura, minimalista y coherente entre controles.
- El reproductor y el chat deben ocupar la mayor parte de la vista disponible.
- El panel para cargar video debe ser compacto y no competir con el area de video.
- En pantalla completa se debe ampliar la pagina completa, no solo el elemento `video`.
- En pantalla completa el primer viewport debe mostrar el reproductor completo con el chat si esta abierto; el panel de carga queda disponible al hacer scroll.
- La barra de scroll en pantalla completa debe quedar invisible, pero el scroll debe seguir funcionando.
- El boton de pantalla completa debe integrarse visualmente con los controles inferiores del reproductor y no activar el fullscreen nativo del video.
- El chat interno debe ser sutil: controles chicos, input transparente y mensajes flotantes o en panel opaco segun selector.
- El chat externo debe poder ubicarse a la derecha, abajo o arriba, y contraerse dejando solo una flecha discreta.
- Si el chat externo esta contraido y llegan mensajes, debe mostrar un contador pequeno de no leidos.
- Los tooltips deben ser discretos, pequenos, estar por encima de paneles y no duplicarse con tooltips nativos.

## Notas para continuar

- Priorizar cambios acotados en `index.html`, `public/styles.css` y `src/main.js`.
- Mantener logs tecnicos en consola o terminal, no como paneles visibles dentro de la UI.
- Validar despues de cada cambio con `node --check src/main.js` y revisar visualmente en `http://127.0.0.1:8080`.
- Si un fix ya esta en `main` pero GitHub Pages sigue cargando una version vieja de `src/main.js`, `public/styles.css` u otro asset versionado, actualizar el query param `?v=` en `index.html` para forzar cache-busting antes de seguir debuggeando.

# Inventario de migración CSS

Corte inicial: 2026-10-11. El inventario base se obtuvo de `public/**/*.css` y HTML fuente; la migración suma referencias dinámicas al cerrar cada dominio.

## Línea de base
- 129 hojas CSS y 2.143 reglas de estilo.
- 433 nombres de clase en CSS; 243 en HTML; 442 nombres únicos combinados (se actualiza el total al incluir nombres solo dinámicos de JS).
- 33 clases BEM iniciales, agrupadas en 14 raíces.
- 400 clases CSS sin delimitadores BEM: mezcla de bloques válidos, elementos heredados, estados, objetos y utilidades; no equivale al número de cambios.

## Trazabilidad
- Etapa 1 — inventario y destinos: completada.
- Etapa 2 — lobby, UI compartida, presencia, edición de nombre y diálogos: completada; 142 nombres renombrados en las referencias de CSS, HTML y JS.
- Verificación etapa 2: `stylelint --quiet`, reglas CSS del proyecto, sintaxis JS de 26 archivos, build/HTML y Playwright en lobby/sala; sin errores de consola.
- Etapa 3 — chat, emojis, mensajes, compositor, medios y espejos mini-player: pendiente.
- Etapa 4 — controles del reproductor, fullscreen, volumen, seek y mini-player: pendiente.
- Etapa 5 — estados, utilidades, objetos, clasificación ITCSS y cierre: pendiente.

## Capas ITCSS
`public/styles.css` ya ordena settings, base, layout, componentes, estados/responsive y overrides finales. Las 129 hojas siguen asignadas por imports existentes; la cascada no se reordenó.

## Criterio de cierre
Todas las clases de aplicación deben tener categoría/destino, todas las referencias heredadas migradas o justificadas como bloque independiente, y la cadena de cache-burst hasta `index.html` verificada junto con `no-store` y ausencia de service worker.

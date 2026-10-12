# Inventario de migración CSS

Corte: 2026-10-11. Incluye clases de CSS, templates HTML y clases dinámicas emitidas desde JavaScript.

## Línea de base y resultado

- Base: 129 hojas CSS, 433 nombres en CSS, 243 en HTML y 442 nombres estáticos únicos.
- Se sumaron 10 nombres dinámicos no presentes en CSS/HTML: alcance inicial de 452 clases.
- Resultado: 129 hojas asignadas a ITCSS, 441 nombres estáticos únicos y 10 nombres solo dinámicos (451 destinos).
- 372 nombres heredados se consolidaron en 367 destinos actuales; se retiraron aliases sin consumidores.
- No quedan referencias a nombres heredados; la auditoría también inspecciona atributos `class` en templates JavaScript.

## Trazabilidad por etapa

- Etapa 1 — inventario y destinos: completa.
- Etapa 2 — lobby, sesión, sala, presencia y diálogos: completa; 142 nombres.
- Etapa 3 — chat, emojis, compositor, mensajes, medios y visor: completa; 113 nombres más 1 ajuste dinámico.
- Etapa 4 — controles del reproductor, fullscreen, seek, volumen y mini-player: completa; 54 nombres.
- Etapa 5 — estados/utilidades, capas ITCSS y cierre de aliases: completa; 62 nombres.

## Mapas y verificación

- [`MAPA_CLASES_CSS.csv`](./MAPA_CLASES_CSS.csv): nombre previo/final, estado, categoría, componente y referencias CSS/HTML/JS.
- [`MAPA_ITCSS_CSS.csv`](./MAPA_ITCSS_CSS.csv): asignación de las 129 hojas y su importador.
- Se conserva el orden de imports y la cascada de `public/styles.css`.
- QA focalizado Playwright: lobby/sala, emojis/envío, badge de estado, tooltip, visor de imagen y quitar preview.
- Build HTML, Stylelint, lint HTML, sintaxis JavaScript tocado y auditoría de clases forman el cierre técnico.
- Confirmado en navegador: URLs v04, respuestas HTML/CSS/JS con `no-store` y cero registros/control de service worker.

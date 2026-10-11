# Contrato CSS: ITCSS, BEM y OOCSS

## Convenciones

- ITCSS: conservar el orden efectivo de imports en `public/styles.css`; capas settings, base, objetos, componentes, estados/responsive y overrides.
- BEM: bloque (`button`), elemento (`button__label`) y modificador (`button--primary`); aplicar el modificador junto a su bloque.
- Estados propios: modificadores del bloque; estados globales de página: `page-context--*`.
- Utilidades compartidas: prefijo `u-`; objetos de layout reutilizables: prefijo `o-`.
- OOCSS separa estructura y apariencia cuando puedan variar independientemente; no dividir componentes por obligación.
- Clases de librerías externas (por ejemplo `.lucide`), IDs, `data-*` y `aria-*` se conservan.
- Cada cambio de clases actualiza CSS, HTML fuente y JavaScript que las genera o consulta; `index.html` se regenera.

## Avance cerrado — 2026-10-11

- Etapa 1 — inventario y destinos: completa; línea base 129 hojas, 442 clases CSS/HTML y 10 tokens dinámicos de JS.
- Etapa 2 — lobby, sesión, sala, presencia y diálogos: completa; 142 nombres migrados.
- Etapa 3 — chat, compositor, emojis, medios, mensajes y visor: completa; 113 nombres y 1 ajuste dinámico.
- Etapa 4 — reproductor, controles, fullscreen y mini-player: completa; 54 nombres.
- Etapa 5 — estados/utilidades transversales, capas ITCSS y aliases: completa; 62 nombres.
- Consolidado: 372 nombres heredados convergen en 367 destinos; inventario final: 451 clases de aplicación (10 solo dinámicas).
- `MAPA_CLASES_CSS.csv` registra nombre previo/final, categoría, componente y referencias CSS/HTML/JS.
- `MAPA_ITCSS_CSS.csv` asigna las 129 hojas; se conserva el orden de cascada existente.
- Auditoría ampliada a templates HTML en JavaScript: cero referencias a nombres heredados.
- Runtime alineado: modificadores de estado del badge y templates BEM del visor y preview de imagen.
- QA Playwright: color de estados del badge, fondo SVG del tooltip, visor (abrir/zoom/cerrar) y preview de imagen (render/quitar).
- Cache-burst `20261011-bem-itcss-oocss-04` verificado; recursos dev `no-store` y cero service workers/controles.
- Build HTML regenerado y URLs v04 solicitadas en navegador.

## Criterio para cambios futuros

- Mantener la convención y ampliar los mapas al agregar o renombrar clases.
- Revisar la cadena de imports/cache-burst afectada y validar la interacción principal del dominio modificado.
- Para cambios futuros, revisar `no-store`, ausencia de service worker y URLs actuales en navegador.

# Contrato CSS: ITCSS, BEM y OOCSS

## Convenciones
- ITCSS: conservar el orden efectivo de `public/styles.css`; las capas son settings, base, objetos, componentes, estados/responsive y overrides.
- BEM: bloque (`button`), elemento (`button__label`) y modificador (`button--primary`); aplicar el modificador junto a su bloque.
- Estados propios: modificadores del bloque; estados globales de página: `page-context--*`.
- Utilidades compartidas: prefijo `u-`; objetos de layout reutilizables: prefijo `o-`.
- OOCSS separa estructura y skin cuando puedan variar por separado; no dividir componentes por obligación.
- Integraciones externas (por ejemplo `.lucide`), IDs, `data-*` y `aria-*` se conservan.
- Cada etapa actualiza CSS, HTML fuente y JavaScript dinámico en conjunto; `index.html` se genera desde `src/index.template.html`.

## Avance
- Inventario inicial: 129 hojas, 433 nombres CSS y 442 nombres únicos entre CSS y HTML; ver [`INVENTARIO_MIGRACION_CSS.md`](./INVENTARIO_MIGRACION_CSS.md).
- Etapa 1 — inventario: completada; los nombres iniciales quedaron clasificados y asociados a destinos.
- Etapa 2 — lobby, sala, presencia, edición de nombre y diálogos: completada; 142 nombres migrados a BEM/OOCSS en CSS, marcado y referencias dinámicas.
- Etapa 2 verificada: build HTML, `stylelint` sin errores, sintaxis de 26 JS tocados y Playwright; editar/cancelar nombre, volver al lobby y abrir ayuda funcionaron; consola sin errores.
- Etapa 3 — chat, compositor, emojis, mensajes y espejos mini-player: pendiente.
- Etapa 4 — reproductor y mini-player: pendiente.
- Etapa 5 — estados/utilidades restantes, clasificación ITCSS/OOCSS y cierre de aliases: pendiente.

## Criterio de cierre
- Todas las clases de aplicación tienen categoría y componente; no quedan referencias a nombres migrados.
- Las 129 hojas están asignadas a capas ITCSS y el orden de imports/cascada se conserva.
- Los estados usan modificadores BEM o utilidades `u-*`; los objetos reutilizables usan `o-*`.
- La cadena afectada llega con cache-burst a `index.html`; servidor `no-store`, sin service worker, y la interacción de mayor riesgo verificada.

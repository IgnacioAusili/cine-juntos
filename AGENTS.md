# Reglas persistentes del proyecto

## Frontend: caché y recursos compilados

- No agregar ni actualizar parámetros `?v=` para recursos propios. Vite agrupa la cadena de CSS y módulos JavaScript y genera nombres con hash de contenido durante `npm run build`.
- Publicar el contenido de `dist/`, generado con `npm run build`; no publicar directamente las fuentes de `src/` y `public/`.
- Verificar que el servidor de desarrollo entregue `Cache-Control: no-store` para HTML, CSS y JavaScript, y confirmar que no exista un service worker interceptando los recursos.
- Validar la aplicación con una recarga limpia en el mismo tipo de viewport y variante de layout que usa el usuario. No dar por válida una variante distinta, por ejemplo chat lateral si el problema ocurre con chat inferior.
- Para posiciones responsive, medir los límites reales con `getBoundingClientRect()` o variables derivadas del layout; evitar números mágicos que solo funcionen en un tamaño.
- Antes de finalizar, revisar las URLs efectivamente solicitadas por el navegador y confirmar que JS/CSS propios apunten a los archivos con hash generados en `dist/assets/`.

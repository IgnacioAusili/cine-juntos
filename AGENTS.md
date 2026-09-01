# Reglas persistentes del proyecto

## Frontend: cache y recursos versionados

- Después de modificar HTML, CSS o módulos JavaScript, revisar todos los `@import` y las importaciones internas relacionadas; no alcanza con cambiar solamente la URL del archivo principal.
- Actualizar el cache-burst de toda la cadena de recursos modificada, incluyendo imports anidados y módulos dinámicos.
- Verificar que el servidor de desarrollo entregue `Cache-Control: no-store` para HTML, CSS y JavaScript, y confirmar que no exista un service worker interceptando los recursos.
- Validar la aplicación con una recarga limpia en el mismo tipo de viewport y variante de layout que usa el usuario. No dar por válida una variante distinta, por ejemplo chat lateral si el problema ocurre con chat inferior.
- Para posiciones responsive, medir los límites reales con `getBoundingClientRect()` o variables derivadas del layout; evitar números mágicos que solo funcionen en un tamaño.
- Antes de finalizar, revisar las URLs efectivamente solicitadas por el navegador y confirmar que no se esté sirviendo una versión anterior.

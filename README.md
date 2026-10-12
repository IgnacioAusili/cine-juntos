# Cine Juntos

App estatica para crear una sala, cargar un link directo de video y sincronizar reproduccion + chat.

## Licencia y responsabilidad

El proyecto se distribuye bajo la **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo
[LICENSE](./LICENSE) para conocer los términos aplicables.

Cine Juntos no aloja ni distribuye videos: solo reproduce enlaces aportados por sus usuarios. El
creador no se responsabiliza por el contenido reproducido ni por el uso del servicio.

## Usar localmente

```powershell
node scripts/dev-server.js --port 8080
```

Abrir `http://localhost:8080`. El servidor genera `index.html` al iniciar y lo vuelve a generar cuando se guarda una fuente HTML.

El marcado se edita en `src/index.template.html` y en los parciales `src/features/<feature>/templates/*.html`. `scripts/build-html.js` ensambla esos parciales; después Vite agrupa el HTML, CSS y JavaScript y genera nombres de recursos con hash de contenido. Para publicar, ejecutar `npm run build` y subir el contenido de `dist/`. GitHub Pages lo hace automáticamente desde su workflow; en Cloudflare Pages, usar `npm run build` como comando y `dist` como directorio de salida.

Con `scripts/dev-server.js`, los logs del cliente se imprimen en la terminal que corre el servidor. En GitHub Pages o Cloudflare Pages no hay una terminal del dispositivo disponible, asi que los logs quedan en la consola del navegador.

Sin Firebase configurado, la app usa modo local para probar dos pestanas del mismo navegador. Si preferis un servidor basico sin logs de terminal, tambien funciona:

```powershell
python -m http.server 8080
```

Ese servidor básico sirve el último `index.html` generado y no observa cambios en los parciales.

## Linters

Las herramientas de desarrollo se instalan con `npm install`. Se pueden ejecutar juntas con `npm run lint` o por separado con `npm run lint:js`, `npm run lint:css`, `npm run lint:html` y `npm run lint:md`. Para regenerar explícitamente la página desde sus parciales, usar `npm run build:html`.

Stylelint muestra como advertencias los selectores de más de 160 caracteres, las cadenas de más de cuatro bloques unidos por combinadores, la anidación CSS superior a tres niveles, el uso de `!important`, los números directos en valores CSS, los colores escritos directamente en propiedades de color y las variables CSS declaradas fuera de la sección inicial del archivo. Los colores literales dentro de una variable CSS (`--color: #...`) están permitidos. `lint:css` también distingue entre valores de diseño repetidos dentro de una misma regla, en selectores distintos o en bloques separados del mismo selector —incluye colores que resuelven a través de variables distintas—, omite propiedades estructurales y advierte si un bloque BEM vuelve a una categoría anterior en el orden base, elementos, variantes, estados y responsive. Los módulos de botones y los controles del reproductor validan nombres BEM; las clases heredadas se migran por componente.

`lint:html` regenera `index.html` desde sus parciales antes de validar el resultado generado y las páginas HTML independientes de `console/`.

La pantalla ya trae precargado este video MP4 de ejemplo:

```text
https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4
```

Usar `Crear`, despues `Cargar` o `Ejemplo`.

## Controles

- Selector `Chat`: elige `Costado`, `Dentro`, `Ambos` u `Oculto`.
- Boton `Ocultar`: oculta todo el chat.
- Boton `#` sobre el video: muestra u oculta el chat sin abrir pantalla completa.

La pagina incluye una politica CSP para permitir el CDN de iconos, Firebase y carga de videos desde URLs `http`, `https`, `blob` o `data`. Si un video no carga, puede ser una restriccion del servidor del video, no de esta pagina.

## Conectar Firebase

No hace falta un token secreto en el frontend. La configuracion web de Firebase es publica; la seguridad depende de Authentication y las reglas de Realtime Database.

1. Crear un proyecto en Firebase.
2. Activar Authentication > Sign-in method > Anonymous.
3. Crear Realtime Database.
4. Copiar la configuracion web en `public/firebase-config.js`.
5. Publicar en GitHub Pages o Cloudflare Pages.

La integracion usa la menor cantidad de operaciones posible: autenticacion anonima, un listener para estado del video, un listener para los ultimos mensajes y el offset de tiempo de Firebase. No escribe presencia ni hace heartbeat periodico.

Reglas iniciales para Realtime Database:

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": "auth != null",
        ".write": "auth != null",
        "messages": {
          "$message": {
            ".validate": "newData.hasChildren(['id', 'from', 'name', 'text', 'createdAt']) && newData.child('text').isString() && newData.child('text').val().length <= 500"
          }
        },
        "state": {
          ".validate": "newData.hasChildren(['action', 'from', 'name', 'sentAt'])"
        }
      }
    }
  }
}
```

## Videos compatibles

El link debe ser un archivo reproducible por el navegador, por ejemplo `.mp4`, `.webm` u otro formato HTML5 soportado. El servidor del video debe permitir reproduccion desde la pagina.

## Estructura

```text
/
  index.html
  src/
    index.template.html
    main.js
    core/
    state/
    services/
    features/
      chat/
        templates/
          *.html
        dock/
        composer/
        messages/
        system-messages/
      diagnostics/
      layout/
      lobby/
        templates/
          *.html
      player/
        templates/
          *.html
        controls/
        fullscreen/
        mini-player/
      presence/
      room/
      session/
        templates/
          *.html
      tooltip/
  public/
    styles.css
    styles/
      chat/
      lobby/
      mini-player/
      mobile/
      player/
      session/
    firebase-config.js
    dev-runtime.js
  scripts/
    build-html.js
    dev-server.js
  docs/
    PASOS_PARA_PUBLICAR.txt
```

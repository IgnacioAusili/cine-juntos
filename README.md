# Cine Juntos

App estatica para crear una sala, cargar un link directo de video y sincronizar reproduccion + chat.

## Usar localmente

```powershell
node scripts/dev-server.js --port 8080
```

Abrir `http://localhost:8080`.

Con `scripts/dev-server.js`, los logs del cliente se imprimen en la terminal que corre el servidor. En GitHub Pages o Cloudflare Pages no hay una terminal del dispositivo disponible, asi que los logs quedan en la consola del navegador.

Sin Firebase configurado, la app usa modo local para probar dos pestanas del mismo navegador. Si preferis un servidor basico sin logs de terminal, tambien funciona:

```powershell
python -m http.server 8080
```

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
    main.js
    core/
    services/
    features/
  public/
    styles.css
    firebase-config.js
    dev-runtime.js
  scripts/
    dev-server.js
  docs/
    PASOS_PARA_PUBLICAR.txt
```

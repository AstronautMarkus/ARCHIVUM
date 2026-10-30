# ARCHIVUM

Museo digital estilo DOOM con los mejores momentos del grupo. Cada piso y sala que se crea en el panel aparece sola en el mundo 3D, en vivo, para todos los que estén conectados.

```
client/   React + react-three-fiber. El museo 3D (render a ~240 líneas) y el panel (#admin)
server/   Flask + MongoDB. Cuentas, permisos, subidas, miniaturas y un WebSocket
          que reparte las posiciones de los visitantes y avisa cuando el museo cambia
```

Arte: el museo (ladrillo blanco, concreto, cantera, fierro) se pinta en código en `client/src/textures.ts`; la ciudad, la calle, el santuario y los sprites son de [Freedoom](https://freedoom.github.io) (licencia BSD, ver `client/public/doom/LICENSE-freedoom.txt`).

## El núcleo

Entre la torre de entrada y el lobby está el núcleo: una galería de un piso con la forma de un plano real (ala norte con la esquina cortada, una cintura donde va la torre, una sala al suroeste y otra al este). No crece con el museo; su plano es el mapa `CORE` de `client/src/layout.ts`.

Sus cuadros están en `client/src/core.json` (`file` y `caption`) y las imágenes en `client/public/core/`. Cada `*` del mapa es un muro con un cuadro en cada cara que da al piso; se llenan en orden de lectura (de arriba abajo y de izquierda a derecha). Los que vienen son pinturas de dominio público bajadas de Wikimedia Commons.

## Correr en local

Necesitas MongoDB corriendo en `localhost:27017` (o apunta `MONGO_URL` a tu base).

```sh
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/gunicorn -w 1 --threads 50 --reload -b 127.0.0.1:8000 app:app

cd client                                     # en otra terminal
npm install && npm run dev                    # http://localhost:5173
```

El primer admin: regístrate en el museo y después corre

```sh
cd server && .venv/bin/flask --app app make-admin tu@email.com
```

## Salas con PIN

Al crear una sala (o después, en el panel) se le puede poner un PIN de 4 dígitos. Su puerta queda cerrada y junto a ella hay un teclado: apunta y pulsa **E**. El servidor revisa el PIN (guardado con hash, con límite de intentos) y responde con un token que desbloquea las piezas de esa sala; el cliente nunca recibe el PIN ni el contenido sin él. La puerta se abre, se cierra detrás de quien entra y adentro hay un botón **SALIDA** (apunta y **E**) que la vuelve a abrir. Al salir la sala se bloquea de nuevo y hay que teclear el PIN otra vez.

## Roles

| Quién | Qué puede hacer |
|---|---|
| Cualquiera | Recorrer el museo (aparece como "Invitado N") |
| Usuario registrado | Lo mismo, con su nombre sobre el marine |
| Curador | Crear pisos y salas, subir fotos/videos/música/notas, borrar lo suyo |
| Admin | Todo lo anterior, más activar curadores y borrar pisos, salas o cualquier pieza, desde el panel |

## API

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/register`, `/api/login` | cualquiera → `{token, user}` |
| GET | `/api/me` | usuario |
| GET | `/api/museum` | cualquiera → `{floors, rooms, exhibits}`; las piezas de una sala con PIN solo llegan con su token en `X-Room-Tokens` (o a un curador) |
| POST | `/api/floors` `{name}`, `/api/rooms` `{floor, title, pin?}` | curador |
| PUT | `/api/rooms/<id>/pin` `{pin}` (vacío lo quita) | curador |
| POST | `/api/rooms/<id>/unlock` `{pin}` → `{token}` | cualquiera, 5 intentos por minuto |
| POST | `/api/exhibits` (multipart: `room`, `file` o `text`, `caption`) | curador; el tipo y el autor los decide el servidor |
| DELETE | `/api/exhibits/<id>` | su autor o admin |
| DELETE | `/api/rooms/<id>`, `/api/floors/<id>` | admin (borra todo lo de adentro) |
| GET / PATCH | `/api/users`, `/api/users/<id>` `{curator}` | admin |
| GET | `/files/<nombre>` | cualquiera |
| WS | `/ws` | primer mensaje `{token}`, después `{f, x, z, y}`; recibe posiciones y `{t: "changed"}` |

El token va en `Authorization: Bearer <token>` y dura 30 días.

## Controles

WASD o flechas para moverse, mouse para mirar, Shift para correr, Espacio para saltar, E para ver de cerca lo que apuntas, Esc para salir. En el ascensor (al inicio del pasillo), las teclas 1-9 cambian de piso.

En la pausa (Esc) eliges la distancia de dibujado (lejos, media o niebla) y prendes el contador de FPS; este navegador lo recuerda.

## Producción

```sh
cd client && npm run build                    # Flask sirve client/dist
cd server && SECRET_KEY=... MONGO_URL=... .venv/bin/gunicorn -w 1 --threads 50 -b 127.0.0.1:8000 app:app
```

- **Un solo worker** (`-w 1`): la lista de visitantes conectados vive en memoria. Cada visitante ocupa un thread, así que `--threads` es el máximo de gente conectada a la vez.
- HTTPS con Caddy: `museo.tudominio.com { reverse_proxy 127.0.0.1:8000 }`
- Respalda MongoDB y `server/uploads/` (ahí quedan las fotos y videos).

## Tests

```sh
cd server && .venv/bin/python -m unittest     # permisos, subidas y borrados (necesita Mongo corriendo)
cd client && npm test                         # generación del mapa
```

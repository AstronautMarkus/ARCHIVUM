# ARCHIVUM

Museo digital estilo DOOM con los mejores momentos del grupo. Cada piso y sala que se crea en el panel aparece sola en el mundo 3D, en vivo, para todos los que estén conectados.

```
client/   React + react-three-fiber. El museo 3D (render a ~240 líneas) y el panel (#admin)
server/   Flask + MongoDB. Cuentas, permisos, subidas, miniaturas y un WebSocket
          que reparte las posiciones de los visitantes y avisa cuando el museo cambia
```

Arte: texturas y sprites de [Freedoom](https://freedoom.github.io) (licencia BSD, ver `client/public/doom/LICENSE-freedoom.txt`).

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
| GET | `/api/museum` | cualquiera → `{floors, rooms, exhibits}` |
| POST | `/api/floors` `{name}`, `/api/rooms` `{floor, title}` | curador |
| POST | `/api/exhibits` (multipart: `room`, `file` o `text`, `caption`) | curador; el tipo y el autor los decide el servidor |
| DELETE | `/api/exhibits/<id>` | su autor o admin |
| DELETE | `/api/rooms/<id>`, `/api/floors/<id>` | admin (borra todo lo de adentro) |
| GET / PATCH | `/api/users`, `/api/users/<id>` `{curator}` | admin |
| GET | `/files/<nombre>` | cualquiera |
| WS | `/ws` | primer mensaje `{token}`, después `{f, x, z, y}`; recibe posiciones y `{t: "changed"}` |

El token va en `Authorization: Bearer <token>` y dura 30 días.

## Controles

WASD o flechas para moverse, mouse para mirar, Shift para correr, E para ver de cerca lo que apuntas, Esc para salir. En el ascensor (al inicio del pasillo), las teclas 1-9 cambian de piso.

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

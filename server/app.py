"""ARCHIVUM server: museum data, accounts, uploads and one websocket for presence + live updates.

Roles: anyone can look; curators add floors, rooms and exhibits; admins also manage users and delete anything.
"""
import itertools
import json
import math
import os
import secrets
import threading
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import click
from bson import ObjectId
from bson.errors import InvalidId
from flask import Flask, abort, g, jsonify, request, send_from_directory
from flask_sock import Sock
from itsdangerous import BadSignature, URLSafeTimedSerializer
from PIL import Image, ImageOps
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError
from simple_websocket import ConnectionClosed
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

HERE = Path(__file__).parent
UPLOADS = Path(os.environ.get('UPLOADS_DIR', HERE / 'uploads'))
# allowed upload types -> (kind, extension); the extension decides the served Content-Type
MEDIA = {
    'image/jpeg': ('photo', '.jpg'), 'image/png': ('photo', '.png'), 'image/gif': ('photo', '.gif'),
    'image/webp': ('photo', '.webp'), 'video/mp4': ('video', '.mp4'), 'video/webm': ('video', '.webm'),
    'audio/mpeg': ('audio', '.mp3'), 'audio/ogg': ('audio', '.ogg'), 'audio/wav': ('audio', '.wav'),
    'audio/x-wav': ('audio', '.wav'), 'audio/mp4': ('audio', '.m4a'), 'audio/x-m4a': ('audio', '.m4a'),
}
TOKEN_AGE = 30 * 24 * 3600

# in production the built client is served from here too
app = Flask(__name__, static_folder=HERE.parent / 'client' / 'dist', static_url_path='/')
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
app.config['SOCK_SERVER_OPTIONS'] = {'ping_interval': 25, 'max_message_size': 2048}
sock = Sock(app)
db = MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017/archivum')).get_default_database()
db.users.create_index('email', unique=True)
UPLOADS.mkdir(parents=True, exist_ok=True)


def secret_key():
    if key := os.environ.get('SECRET_KEY'):
        return key
    f = HERE / '.secret'  # dev: keep a random key on disk so logins survive restarts
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text()


tokens = URLSafeTimedSerializer(secret_key(), salt='auth')


@app.errorhandler(HTTPException)
def json_error(e):
    return jsonify(error=e.description), e.code


def now():
    return datetime.now(timezone.utc)


def out(doc):
    """Mongo doc -> JSON: ids become strings and the password hash never leaves."""
    d = {k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items() if k != 'password'}
    d['id'] = d.pop('_id')
    return d


def oid(value):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        abort(404, 'No existe')


def clean(data, key, limit):
    return str(data.get(key) or '').strip()[:limit]


# ---- accounts ----

def user_from_token(token):
    if not isinstance(token, str) or not token:
        return None
    try:
        uid = tokens.loads(token, max_age=TOKEN_AGE)
    except BadSignature:
        return None
    return db.users.find_one({'_id': ObjectId(uid)})


def need(role=None):
    """Requires a logged-in user; role 'curator' or 'admin' (admins pass every check)."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            g.user = user_from_token(request.headers.get('Authorization', '').removeprefix('Bearer '))
            if not g.user:
                abort(401, 'Inicia sesión')
            if role and not (g.user.get(role) or g.user.get('admin')):
                abort(403, 'No tienes permiso')
            return fn(*args, **kwargs)
        return wrapper
    return deco


def session(user):
    return jsonify(token=tokens.dumps(str(user['_id'])), user=out(user))


@app.post('/api/register')
def register():
    b = request.get_json(silent=True) or {}
    email, name, password = clean(b, 'email', 200).lower(), clean(b, 'name', 24), str(b.get('password') or '')
    if '@' not in email or not name or len(password) < 8:
        abort(400, 'Necesitas email, nombre y una contraseña de 8+ caracteres')
    # roles are set here, never taken from the request
    user = {'email': email, 'name': name, 'password': generate_password_hash(password),
            'curator': False, 'admin': False, 'created': now()}
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        abort(400, 'Ese email ya tiene cuenta')
    return session(user)


@app.post('/api/login')
def login():
    b = request.get_json(silent=True) or {}
    user = db.users.find_one({'email': clean(b, 'email', 200).lower()})
    # shortcut: no brute-force throttling; put a rate limit in the reverse proxy if this goes public
    if not user or not check_password_hash(user['password'], str(b.get('password') or '')):
        abort(400, 'Email o contraseña incorrectos')
    return session(user)


@app.get('/api/me')
@need()
def me():
    return jsonify(user=out(g.user))


@app.get('/api/users')
@need('admin')
def list_users():
    return jsonify([out(u) for u in db.users.find().sort('created', 1)])


@app.patch('/api/users/<id>')
@need('admin')
def set_curator(id):
    b = request.get_json(silent=True) or {}
    user = db.users.find_one_and_update({'_id': oid(id)}, {'$set': {'curator': bool(b.get('curator'))}},
                                        return_document=ReturnDocument.AFTER) or abort(404, 'No existe')
    return jsonify(out(user))


@app.cli.command('make-admin')
@click.argument('email')
def make_admin(email):
    """Gives an existing account admin rights."""
    r = db.users.update_one({'email': email.strip().lower()}, {'$set': {'admin': True, 'curator': True}})
    click.echo('Listo' if r.matched_count else 'No existe esa cuenta: regístrala primero en el museo')


# ---- museum ----

@app.get('/api/museum')
def museum():
    # shortcut: sends the whole museum at once; page it per floor past a few thousand exhibits
    by_order = [('order', 1), ('created', 1)]
    return jsonify(floors=[out(d) for d in db.floors.find().sort(by_order)],
                   rooms=[out(d) for d in db.rooms.find().sort(by_order)],
                   exhibits=[out(d) for d in db.exhibits.find().sort('created', 1)])


@app.post('/api/floors')
@need('curator')
def add_floor():
    name = clean(request.get_json(silent=True) or {}, 'name', 60) or abort(400, 'Falta el nombre')
    doc = {'name': name, 'order': db.floors.count_documents({}) + 1, 'created': now()}
    db.floors.insert_one(doc)
    changed()
    return jsonify(out(doc)), 201


@app.post('/api/rooms')
@need('curator')
def add_room():
    b = request.get_json(silent=True) or {}
    floor = db.floors.find_one({'_id': oid(b.get('floor'))}) or abort(404, 'Ese piso no existe')
    title = clean(b, 'title', 60) or abort(400, 'Falta el nombre')
    doc = {'floor': floor['_id'], 'title': title, 'order': db.rooms.count_documents({'floor': floor['_id']}) + 1,
           'created': now()}
    db.rooms.insert_one(doc)
    changed()
    return jsonify(out(doc)), 201


def make_thumb(path):
    """512px JPEG for the 3D view; raises if the file is not a real image."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)  # phone photos store rotation in EXIF
        im.thumbnail((512, 512))
        name = f'{path.stem}_t.jpg'
        im.convert('RGB').save(UPLOADS / name, 'JPEG', quality=85)
    return name


@app.post('/api/exhibits')
@need('curator')
def add_exhibit():
    room = db.rooms.find_one({'_id': oid(request.form.get('room'))}) or abort(404, 'Esa sala no existe')
    doc = {'room': room['_id'], 'author': g.user['_id'], 'caption': clean(request.form, 'caption', 200),
           'text': clean(request.form, 'text', 2000), 'file': '', 'thumb': '', 'created': now()}
    if f := request.files.get('file'):
        kind, ext = MEDIA.get(f.mimetype) or abort(400, 'Tipo de archivo no permitido')
        path = UPLOADS / f'{ObjectId()}{ext}'
        f.save(path)
        if kind == 'photo':
            try:
                doc['thumb'] = make_thumb(path)
            except (OSError, ValueError, Image.DecompressionBombError):
                path.unlink()
                abort(400, 'Esa imagen está dañada o no es una imagen')
        doc |= {'kind': kind, 'file': path.name}
    elif doc['text']:
        doc['kind'] = 'note'
    else:
        abort(400, 'Sube un archivo o escribe una nota')
    db.exhibits.insert_one(doc)
    changed()
    return jsonify(out(doc)), 201


def remove_exhibits(query):
    for ex in db.exhibits.find(query):
        for name in (ex['file'], ex['thumb']):
            if name:
                (UPLOADS / name).unlink(missing_ok=True)
    db.exhibits.delete_many(query)


@app.delete('/api/exhibits/<id>')
@need('curator')
def delete_exhibit(id):
    ex = db.exhibits.find_one({'_id': oid(id)}) or abort(404, 'No existe')
    if ex['author'] != g.user['_id'] and not g.user.get('admin'):
        abort(403, 'Solo puedes borrar lo que subiste')
    remove_exhibits({'_id': ex['_id']})
    changed()
    return '', 204


@app.delete('/api/rooms/<id>')
@need('admin')
def delete_room(id):
    room_id = oid(id)
    remove_exhibits({'room': room_id})
    db.rooms.delete_one({'_id': room_id})
    changed()
    return '', 204


@app.delete('/api/floors/<id>')
@need('admin')
def delete_floor(id):
    floor_id = oid(id)
    rooms = [r['_id'] for r in db.rooms.find({'floor': floor_id}, {'_id': 1})]
    remove_exhibits({'room': {'$in': rooms}})
    db.rooms.delete_many({'floor': floor_id})
    db.floors.delete_one({'_id': floor_id})
    changed()
    return '', 204


@app.get('/files/<name>')
def files(name):
    res = send_from_directory(UPLOADS, name, max_age=365 * 24 * 3600)  # supports Range for video seeking
    res.headers['X-Content-Type-Options'] = 'nosniff'
    res.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
    return res


@app.get('/')
def index():
    return app.send_static_file('index.html')


# ---- live: presence + "museum changed" pushes ----

ids = itertools.count(1)
peers = {}  # websocket -> its send lock (a socket must not be written from two threads at once)
peers_lock = threading.Lock()


def broadcast(msg, skip=None):
    data = json.dumps(msg)
    with peers_lock:
        targets = [(ws, lock) for ws, lock in peers.items() if ws is not skip]
    for ws, lock in targets:
        try:
            with lock:
                ws.send(data)
        except ConnectionClosed:
            pass


def changed():
    broadcast({'t': 'changed'})


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


@sock.route('/ws')
def live(ws):
    """First message {token} ('' for guests), then {f: floorId, x, z, y: yaw} ~10/s."""
    pid = next(ids)
    try:
        first = json.loads(ws.receive(timeout=10) or '{}')
    except (ValueError, ConnectionClosed):
        return
    # names come from the database, never from the client, so nobody can pose as a friend
    user = user_from_token(first.get('token') if isinstance(first, dict) else None)
    name = user['name'] if user else f'Invitado {pid}'
    with peers_lock:
        peers[ws] = threading.Lock()
    try:
        # shortcut: no rate limit, every position goes to every visitor; fine for a group of friends
        while True:
            try:
                p = json.loads(ws.receive())
            except ValueError:
                continue
            if (isinstance(p, dict) and isinstance(p.get('f'), str) and len(p['f']) <= 32
                    and all(is_num(p.get(k)) for k in 'xzy')):
                broadcast({'id': pid, 'n': name, 'f': p['f'], 'x': p['x'], 'z': p['z'], 'y': p['y']}, skip=ws)
    except ConnectionClosed:
        pass
    finally:
        with peers_lock:
            peers.pop(ws, None)
        broadcast({'id': pid, 'bye': True})

"""The building: floors, rooms and PIN-locked rooms."""
import re
import time

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, abort, jsonify, request
from itsdangerous import BadSignature
from werkzeug.security import check_password_hash, generate_password_hash

from .auth import need, request_user
from .db import db
from .exhibits import remove_exhibits
from .live import changed
from .utils import clean, now, oid, out, signer

MAX_FLOORS = 99  # the client draws the whole building at once; keep it sane
# a wrong PIN costs a try; after PIN_TRIES in PIN_WINDOW seconds that visitor waits for the window to pass
PIN_TRIES, PIN_WINDOW, ROOM_TOKEN_AGE = 5, 60, 3600
failures = {}  # (ip, room) -> times of the recent wrong PINs

bp = Blueprint('museum', __name__, url_prefix='/api')


def room_out(room, count):
    """A room as the client sees it: the PIN's hash never leaves, a locked room only says how many exhibits it holds."""
    d = out({k: v for k, v in room.items() if k != 'pin'})
    return {**d, 'locked': True, 'count': count} if room.get('pin') else d


def held_rooms(header):
    """Rooms whose unlock tokens are in `header` (comma separated) and still valid."""
    held = set()
    for t in header.split(',')[:50]:
        try:
            held.add(ObjectId(signer('room').loads(t.strip(), max_age=ROOM_TOKEN_AGE)))
        except (BadSignature, InvalidId):
            pass
    return held


@bp.get('/museum')
def museum():
    # shortcut: sends the whole museum at once; page it per floor past a few thousand exhibits.
    # The exhibits of a PIN room come only with the token its unlock gave, in X-Room-Tokens
    by_order = [('order', 1), ('created', 1)]
    counts = {d['_id']: d['n'] for d in db.exhibits.aggregate([{'$group': {'_id': '$room', 'n': {'$sum': 1}}}])}
    rooms = list(db.rooms.find().sort(by_order))
    user = request_user()
    staff = user and (user.get('curator') or user.get('admin'))  # curators manage every room, PIN or not
    open_rooms = {r['_id'] for r in rooms if staff or not r.get('pin')} | held_rooms(request.headers.get('X-Room-Tokens', ''))
    return jsonify(floors=[out(d) for d in db.floors.find().sort(by_order)],
                   rooms=[room_out(r, counts.get(r['_id'], 0)) for r in rooms],
                   exhibits=[out(d) for d in db.exhibits.find({'room': {'$in': list(open_rooms)}}).sort('created', 1)])


@bp.post('/floors')
@need('curator')
def add_floor():
    b = request.get_json(silent=True) or {}
    name = clean(b, 'name', 60) or abort(400, 'Falta el nombre')
    color = clean(b, 'color', 7).lower()  # its floor is this color and white; none: the client picks one
    if color and not re.fullmatch(r'#[0-9a-f]{6}', color):
        abort(400, 'El color debe ser como #b32626')
    count = db.floors.count_documents({})
    if count >= MAX_FLOORS:
        abort(400, f'El museo ya tiene el máximo de {MAX_FLOORS} pisos')
    doc = {'name': name, 'order': count + 1, 'created': now(), **({'color': color} if color else {})}
    db.floors.insert_one(doc)
    changed()
    return jsonify(out(doc)), 201


@bp.delete('/floors/<id>')
@need('admin')
def delete_floor(id):
    floor_id = oid(id)
    rooms = [r['_id'] for r in db.rooms.find({'floor': floor_id}, {'_id': 1})]
    remove_exhibits({'room': {'$in': rooms}})
    db.rooms.delete_many({'floor': floor_id})
    db.floors.delete_one({'_id': floor_id})
    changed()
    return '', 204


def hash_pin(pin):
    if not re.fullmatch(r'\d{4}', pin):
        abort(400, 'El PIN debe tener 4 dígitos')
    return generate_password_hash(pin)


@bp.post('/rooms')
@need('curator')
def add_room():
    b = request.get_json(silent=True) or {}
    floor = db.floors.find_one({'_id': oid(b.get('floor'))}) or abort(404, 'Ese piso no existe')
    title = clean(b, 'title', 60) or abort(400, 'Falta el nombre')
    doc = {'floor': floor['_id'], 'title': title, 'order': db.rooms.count_documents({'floor': floor['_id']}) + 1,
           'created': now()}
    if pin := clean(b, 'pin', 20):
        doc['pin'] = hash_pin(pin)
    db.rooms.insert_one(doc)
    changed()
    return jsonify(room_out(doc, 0)), 201


@bp.delete('/rooms/<id>')
@need('admin')
def delete_room(id):
    room_id = oid(id)
    remove_exhibits({'room': room_id})
    db.rooms.delete_one({'_id': room_id})
    changed()
    return '', 204


@bp.put('/rooms/<id>/pin')
@need('curator')
def set_pin(id):
    """Sets the room's PIN, or removes it when `pin` is empty."""
    b = request.get_json(silent=True) or {}
    pin = clean(b, 'pin', 20)
    update = {'$set': {'pin': hash_pin(pin)}} if pin else {'$unset': {'pin': ''}}
    if not db.rooms.update_one({'_id': oid(id)}, update).matched_count:
        abort(404, 'Esa sala no existe')
    changed()
    return '', 204


@bp.post('/rooms/<id>/unlock')
def unlock_room(id):
    room = db.rooms.find_one({'_id': oid(id)}) or abort(404, 'Esa sala no existe')
    if not room.get('pin'):
        abort(400, 'Esa sala no tiene PIN')
    key, t = (request.remote_addr, room['_id']), time.monotonic()
    recent = [f for f in failures.pop(key, []) if t - f < PIN_WINDOW]
    if len(recent) >= PIN_TRIES:
        failures[key] = recent
        abort(429, 'Demasiados intentos, espera un momento')
    if not check_password_hash(room['pin'], clean(request.get_json(silent=True) or {}, 'pin', 20)):
        failures[key] = [*recent, t]
        abort(403, 'PIN incorrecto')
    return jsonify(token=signer('room').dumps(str(room['_id'])))

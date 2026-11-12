"""Accounts: register, login, tokens, roles and the make-admin command."""
from functools import wraps

import click
from bson import ObjectId
from flask import Blueprint, abort, g, jsonify, request
from itsdangerous import BadSignature
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash

from .db import db
from .utils import clean, now, oid, out, signer

TOKEN_AGE = 30 * 24 * 3600

bp = Blueprint('auth', __name__, url_prefix='/api', cli_group=None)


def user_from_token(token):
    if not isinstance(token, str) or not token:
        return None
    try:
        uid = signer('auth').loads(token, max_age=TOKEN_AGE)
    except BadSignature:
        return None
    return db.users.find_one({'_id': ObjectId(uid)})


def request_user():
    return user_from_token(request.headers.get('Authorization', '').removeprefix('Bearer '))


def need(role=None):
    """Requires a logged-in user; role 'curator' or 'admin' (admins pass every check)."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            g.user = request_user()
            if not g.user:
                abort(401, 'Inicia sesión')
            if role and not (g.user.get(role) or g.user.get('admin')):
                abort(403, 'No tienes permiso')
            return fn(*args, **kwargs)
        return wrapper
    return deco


def session(user):
    return jsonify(token=signer('auth').dumps(str(user['_id'])), user=out(user))


@bp.post('/register')
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


@bp.post('/login')
def login():
    b = request.get_json(silent=True) or {}
    user = db.users.find_one({'email': clean(b, 'email', 200).lower()})
    # shortcut: no brute-force throttling; put a rate limit in the reverse proxy if this goes public
    if not user or not check_password_hash(user['password'], str(b.get('password') or '')):
        abort(400, 'Email o contraseña incorrectos')
    return session(user)


@bp.get('/me')
@need()
def me():
    return jsonify(user=out(g.user))


@bp.get('/users')
@need('admin')
def list_users():
    return jsonify([out(u) for u in db.users.find().sort('created', 1)])


@bp.patch('/users/<id>')
@need('admin')
def set_curator(id):
    b = request.get_json(silent=True) or {}
    user = db.users.find_one_and_update({'_id': oid(id)}, {'$set': {'curator': bool(b.get('curator'))}},
                                        return_document=ReturnDocument.AFTER) or abort(404, 'No existe')
    return jsonify(out(user))


@bp.cli.command('make-admin')
@click.argument('email')
def make_admin(email):
    """Gives an existing account admin rights."""
    r = db.users.update_one({'email': email.strip().lower()}, {'$set': {'admin': True, 'curator': True}})
    click.echo('Listo' if r.matched_count else 'No existe esa cuenta: regístrala primero en el museo')

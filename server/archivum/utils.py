from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from flask import abort, current_app
from itsdangerous import URLSafeTimedSerializer


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


def signer(salt):
    return URLSafeTimedSerializer(current_app.secret_key, salt=salt)


def uploads() -> Path:
    return current_app.config['UPLOADS_DIR']

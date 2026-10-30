"""Exhibits: uploads, thumbnails, deletion and serving the files."""
from bson import ObjectId
from flask import Blueprint, abort, g, jsonify, request, send_from_directory
from PIL import Image, ImageOps

from .auth import need
from .db import db
from .live import changed
from .utils import clean, now, oid, out, uploads

# allowed upload types -> (kind, extension); the extension decides the served Content-Type
MEDIA = {
    'image/jpeg': ('photo', '.jpg'), 'image/png': ('photo', '.png'), 'image/gif': ('photo', '.gif'),
    'image/webp': ('photo', '.webp'), 'video/mp4': ('video', '.mp4'), 'video/webm': ('video', '.webm'),
    'audio/mpeg': ('audio', '.mp3'), 'audio/ogg': ('audio', '.ogg'), 'audio/wav': ('audio', '.wav'),
    'audio/x-wav': ('audio', '.wav'), 'audio/mp4': ('audio', '.m4a'), 'audio/x-m4a': ('audio', '.m4a'),
}

bp = Blueprint('exhibits', __name__)


def make_thumb(path):
    """512px JPEG for the 3D view; raises if the file is not a real image."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)  # phone photos store rotation in EXIF
        im.thumbnail((512, 512))
        name = f'{path.stem}_t.jpg'
        im.convert('RGB').save(uploads() / name, 'JPEG', quality=85)
    return name


@bp.post('/api/exhibits')
@need('curator')
def add_exhibit():
    room = db.rooms.find_one({'_id': oid(request.form.get('room'))}) or abort(404, 'Esa sala no existe')
    doc = {'room': room['_id'], 'author': g.user['_id'], 'caption': clean(request.form, 'caption', 200),
           'text': clean(request.form, 'text', 2000), 'file': '', 'thumb': '', 'created': now()}
    if f := request.files.get('file'):
        kind, ext = MEDIA.get(f.mimetype) or abort(400, 'Tipo de archivo no permitido')
        path = uploads() / f'{ObjectId()}{ext}'
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
                (uploads() / name).unlink(missing_ok=True)
    db.exhibits.delete_many(query)


@bp.delete('/api/exhibits/<id>')
@need('curator')
def delete_exhibit(id):
    ex = db.exhibits.find_one({'_id': oid(id)}) or abort(404, 'No existe')
    if ex['author'] != g.user['_id'] and not g.user.get('admin'):
        abort(403, 'Solo puedes borrar lo que subiste')
    remove_exhibits({'_id': ex['_id']})
    changed()
    return '', 204


@bp.get('/files/<name>')
def files(name):
    res = send_from_directory(uploads(), name, max_age=365 * 24 * 3600)  # supports Range for video seeking
    res.headers['X-Content-Type-Options'] = 'nosniff'
    res.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
    return res

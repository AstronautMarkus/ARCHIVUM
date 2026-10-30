"""API tests against a real MongoDB (database archivum_test). Run: .venv/bin/python -m unittest"""
import io
import os
import tempfile
import unittest

from PIL import Image

from archivum import create_app, museum

app = create_app({'MONGO_URL': 'mongodb://localhost:27017/archivum_test', 'UPLOADS_DIR': tempfile.mkdtemp(),
                  'SECRET_KEY': 'test', 'CORS_ORIGINS': ['https://cliente.test']})
db = app.extensions['mongo']
UPLOADS = app.config['UPLOADS_DIR']


def png():
    buf = io.BytesIO()
    Image.new('RGB', (900, 300), 'orange').save(buf, 'PNG')
    buf.seek(0)
    return buf


class Api(unittest.TestCase):
    def setUp(self):
        for c in ('users', 'floors', 'rooms', 'exhibits'):
            db[c].delete_many({})
        self.c = app.test_client()

    def account(self, name, **roles):
        # tries to self-promote on register; the server must ignore it
        r = self.c.post('/api/register', json={'email': f'{name}@t.test', 'password': '12345678', 'name': name,
                                               'curator': True, 'admin': True})
        self.assertEqual(r.status_code, 200, r.json)
        self.assertFalse(r.json['user']['curator'] or r.json['user']['admin'])
        self.assertNotIn('password', r.json['user'])
        db.users.update_one({'email': f'{name}@t.test'}, {'$set': roles})
        return {'Authorization': f"Bearer {r.json['token']}"}, r.json['user']['id']

    def room(self, auth):
        floor = self.c.post('/api/floors', json={'name': 'Piso 1'}, headers=auth).json
        return self.c.post('/api/rooms', json={'floor': floor['id'], 'title': 'Sala'}, headers=auth).json

    def upload(self, auth, room, **form):
        return self.c.post('/api/exhibits', data={'room': room['id'], **form}, headers=auth,
                           content_type='multipart/form-data')

    def test_login_and_tokens(self):
        self.account('ana')
        self.assertEqual(self.c.post('/api/login', json={'email': 'ANA@t.test', 'password': 'nope1234'}).status_code, 400)
        r = self.c.post('/api/login', json={'email': 'ANA@t.test', 'password': '12345678'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.get('/api/me', headers={'Authorization': f"Bearer {r.json['token']}"}).status_code, 200)
        self.assertEqual(self.c.get('/api/me', headers={'Authorization': f"Bearer {r.json['token']}x"}).status_code, 401)
        self.assertEqual(self.c.post('/api/register', json={'email': 'ana@t.test', 'password': '12345678', 'name': 'x'}).status_code, 400)

    def test_only_curators_create(self):
        visitor, _ = self.account('visitor')
        self.assertEqual(self.c.post('/api/floors', json={'name': 'x'}).status_code, 401)
        self.assertEqual(self.c.post('/api/floors', json={'name': 'x'}, headers=visitor).status_code, 403)
        curator, _ = self.account('cura', curator=True)
        room = self.room(curator)
        self.assertEqual(self.upload(visitor, room, text='hola').status_code, 403)
        self.assertEqual(self.c.get('/api/museum').json['rooms'][0]['title'], 'Sala')

    def test_floor_color(self):
        curator, _ = self.account('ana', curator=True)
        r = self.c.post('/api/floors', json={'name': 'Rojo', 'color': '#B32626'}, headers=curator)
        self.assertEqual((r.status_code, r.json['color']), (201, '#b32626'))
        self.assertNotIn('color', self.c.post('/api/floors', json={'name': 'Sin color'}, headers=curator).json)
        for bad in ('red', '#b3262', 'url(x)', 12):
            self.assertEqual(self.c.post('/api/floors', json={'name': 'x', 'color': bad}, headers=curator).status_code, 400)

    def test_floor_limit(self):
        curator, _ = self.account('cura', curator=True)
        db.floors.insert_many([{'name': f'{i}', 'order': i} for i in range(museum.MAX_FLOORS - 1)])
        self.assertEqual(self.c.post('/api/floors', json={'name': 'último'}, headers=curator).status_code, 201)
        r = self.c.post('/api/floors', json={'name': 'uno más'}, headers=curator)
        self.assertEqual((r.status_code, db.floors.count_documents({})), (400, museum.MAX_FLOORS))

    def test_uploads(self):
        curator, uid = self.account('cura', curator=True)
        _, other = self.account('otro')
        room = self.room(curator)
        r = self.upload(curator, room, caption='Playa', author=other, file=(png(), 'p.png', 'image/png'))
        self.assertEqual(r.status_code, 201, r.json)
        self.assertEqual((r.json['kind'], r.json['author']), ('photo', uid))  # author can't be spoofed
        thumb = self.c.get(f"/files/{r.json['thumb']}")
        self.assertEqual(Image.open(io.BytesIO(thumb.data)).size, (512, 171))
        thumb.close()
        full = self.c.get(f"/files/{r.json['file']}")
        self.assertEqual((full.mimetype, full.headers['X-Content-Type-Options']), ('image/png', 'nosniff'))
        full.close()

        before = set(os.listdir(UPLOADS))
        fake = (io.BytesIO(b'<script>alert(1)</script>'), 'x.png', 'image/png')
        self.assertEqual(self.upload(curator, room, file=fake).status_code, 400)
        html = (io.BytesIO(b'<script>alert(1)</script>'), 'x.html', 'text/html')
        self.assertEqual(self.upload(curator, room, file=html).status_code, 400)
        self.assertEqual(set(os.listdir(UPLOADS)), before, 'rejected files are not kept')

        self.assertEqual(self.upload(curator, room, text='Nunca olvidar').json['kind'], 'note')
        self.assertEqual(self.upload(curator, room).status_code, 400)
        self.assertEqual(self.c.get('/files/..%2Fwsgi.py').status_code, 404)

    def test_delete_rules(self):
        ana, _ = self.account('ana', curator=True)
        beto, _ = self.account('beto', curator=True)
        admin, _ = self.account('admin', admin=True)
        room = self.room(ana)
        mine = self.upload(ana, room, file=(png(), 'p.png', 'image/png')).json
        self.assertEqual(self.c.delete(f"/api/exhibits/{mine['id']}", headers=beto).status_code, 403)
        self.assertEqual(self.c.delete(f"/api/exhibits/{mine['id']}", headers=ana).status_code, 204)
        self.assertFalse((UPLOADS / mine['file']).exists())

        kept = self.upload(beto, room, file=(png(), 'p.png', 'image/png')).json
        self.assertEqual(self.c.delete(f"/api/floors/{room['floor']}", headers=ana).status_code, 403)
        self.assertEqual(self.c.delete(f"/api/floors/{room['floor']}", headers=admin).status_code, 204)
        m = self.c.get('/api/museum').json
        self.assertEqual((m['floors'], m['rooms'], m['exhibits']), ([], [], []))
        self.assertFalse((UPLOADS / kept['thumb']).exists())

    def test_pin_rooms(self):
        curator, _ = self.account('cura', curator=True)
        floor = self.c.post('/api/floors', json={'name': 'Piso 1'}, headers=curator).json
        for bad in ('12', 'abcd', '12345'):
            self.assertEqual(self.c.post('/api/rooms', json={'floor': floor['id'], 'title': 'x', 'pin': bad}, headers=curator).status_code, 400)
        room = self.c.post('/api/rooms', json={'floor': floor['id'], 'title': 'Secreta', 'pin': '6767'}, headers=curator).json
        self.assertNotIn('pin', room)
        self.assertTrue(db.rooms.find_one()['pin'].startswith(('scrypt', 'pbkdf2')))
        self.upload(curator, room, text='secreto')

        # visitors see the room is locked, how full it is, and none of its exhibits
        m = self.c.get('/api/museum').json
        self.assertEqual((m['rooms'][0]['locked'], m['rooms'][0]['count'], m['exhibits']), (True, 1, []))
        self.assertNotIn('pin', m['rooms'][0])
        self.assertEqual(len(self.c.get('/api/museum', headers=curator).json['exhibits']), 1)

        url = f"/api/rooms/{room['id']}/unlock"
        self.assertEqual(self.c.post(url, json={'pin': '0000'}).status_code, 403)
        token = self.c.post(url, json={'pin': '6767'}).json['token']
        self.assertEqual(len(self.c.get('/api/museum', headers={'X-Room-Tokens': f'junk,{token}'}).json['exhibits']), 1)
        self.assertEqual(self.c.get('/api/museum', headers={'X-Room-Tokens': token + 'x'}).json['exhibits'], [])

        # the PIN can be changed, and removed to open the room to everyone
        self.assertEqual(self.c.put(f"/api/rooms/{room['id']}/pin", json={'pin': '1111'}, headers=curator).status_code, 204)
        self.assertEqual(self.c.post(url, json={'pin': '6767'}).status_code, 403)
        self.assertEqual(self.c.put(f"/api/rooms/{room['id']}/pin", json={'pin': ''}, headers=curator).status_code, 204)
        m = self.c.get('/api/museum').json
        self.assertEqual((m['rooms'][0].get('locked'), len(m['exhibits'])), (None, 1))

    def test_pin_attempts_are_limited(self):
        curator, _ = self.account('cura', curator=True)
        floor = self.c.post('/api/floors', json={'name': 'Piso 1'}, headers=curator).json
        room = self.c.post('/api/rooms', json={'floor': floor['id'], 'title': 'S', 'pin': '6767'}, headers=curator).json
        museum.failures.clear()
        url = f"/api/rooms/{room['id']}/unlock"
        codes = [self.c.post(url, json={'pin': '0000'}).status_code for _ in range(museum.PIN_TRIES + 1)]
        self.assertEqual(codes, [403] * museum.PIN_TRIES + [429])
        self.assertEqual(self.c.post(url, json={'pin': '6767'}).status_code, 429)  # even the right one, until it passes

    def test_cors_only_for_listed_origins(self):
        ok = self.c.options('/api/login', headers={'Origin': 'https://cliente.test', 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(ok.headers.get('Access-Control-Allow-Origin'), 'https://cliente.test')
        self.assertIn('Authorization', ok.headers['Access-Control-Allow-Headers'])
        self.assertNotIn('Access-Control-Allow-Origin', self.c.get('/api/museum', headers={'Origin': 'https://malo.test'}).headers)

    def test_admin_manages_curators(self):
        cura, _ = self.account('cura', curator=True)
        admin, _ = self.account('admin', admin=True)
        _, uid = self.account('nuevo')
        self.assertEqual(self.c.get('/api/users', headers=cura).status_code, 403)
        self.assertEqual(self.c.patch(f'/api/users/{uid}', json={'curator': True}, headers=cura).status_code, 403)
        users = self.c.get('/api/users', headers=admin).json
        self.assertTrue(all('password' not in u for u in users))
        self.assertTrue(self.c.patch(f'/api/users/{uid}', json={'curator': True}, headers=admin).json['curator'])


if __name__ == '__main__':
    unittest.main()

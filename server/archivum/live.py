"""One websocket for presence, chat and "museum changed" pushes."""
import itertools
import json
import math
import threading
import time

from flask import Blueprint
from flask_sock import Sock
from simple_websocket import ConnectionClosed

from .auth import user_from_token

bp = Blueprint('live', __name__)
sock = Sock()

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


@sock.route('/ws', bp=bp)
def live(ws):
    """First message {token} ('' for guests), then {f: floorId, x, z, y: yaw, h: height} ~10/s, or {chat: text}."""
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
    last_chat = 0.0
    try:
        # shortcut: no rate limit on positions, every one goes to every visitor; fine for a group of friends
        while True:
            try:
                p = json.loads(ws.receive())
            except ValueError:
                continue
            if not isinstance(p, dict):
                continue
            if isinstance(p.get('chat'), str):
                text = p['chat'].strip()[:200]
                # chat needs an account and allows one message per second; the sender gets it back too
                if user and text and time.monotonic() - last_chat >= 1:
                    last_chat = time.monotonic()
                    broadcast({'id': pid, 'n': name, 'chat': text})
            elif isinstance(p.get('f'), str) and len(p['f']) <= 32 and all(is_num(p.get(k)) for k in 'xzy'):
                h = p['h'] if is_num(p.get('h')) else 0
                broadcast({'id': pid, 'n': name, 'f': p['f'], 'x': p['x'], 'z': p['z'], 'y': p['y'], 'h': h}, skip=ws)
    except ConnectionClosed:
        pass
    finally:
        with peers_lock:
            peers.pop(ws, None)
        broadcast({'id': pid, 'bye': True})

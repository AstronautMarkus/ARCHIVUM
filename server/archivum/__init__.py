"""ARCHIVUM server: museum data, accounts, uploads and one websocket for presence + live updates.

Roles: anyone can look; curators add floors, rooms and exhibits; admins also manage users and delete anything.
"""
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from . import auth, db, exhibits, live, museum
from .config import ROOT, Config, dev_secret


def create_app(overrides=None):
    # in production the built client is served from here too
    app = Flask(__name__, static_folder=ROOT.parent / 'client' / 'dist', static_url_path='/')
    app.config.from_object(Config)
    app.config.update(overrides or {})
    app.config['SECRET_KEY'] = app.config['SECRET_KEY'] or dev_secret()
    app.config['UPLOADS_DIR'] = Path(app.config['UPLOADS_DIR'])
    app.config['UPLOADS_DIR'].mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    for module in (auth, museum, exhibits, live):
        app.register_blueprint(module.bp)

    @app.errorhandler(HTTPException)
    def json_error(e):
        return jsonify(error=e.description), e.code

    @app.after_request
    def cors(res):
        if (origin := request.headers.get('Origin')) in app.config['CORS_ORIGINS']:
            res.headers.update({'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
                                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Room-Tokens',
                                'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE'})
        return res

    @app.get('/')
    def index():
        return app.send_static_file('index.html')

    return app

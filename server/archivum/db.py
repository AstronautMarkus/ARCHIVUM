from flask import current_app
from pymongo import MongoClient
from werkzeug.local import LocalProxy

# the current app's database, so modules can just `from .db import db`
db = LocalProxy(lambda: current_app.extensions['mongo'])


def init_app(app):
    mongo = MongoClient(app.config['MONGO_URL']).get_default_database()
    mongo.users.create_index('email', unique=True)
    app.extensions['mongo'] = mongo

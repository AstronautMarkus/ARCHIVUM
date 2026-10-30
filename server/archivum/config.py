"""Settings come from the environment; a server/.env fills in whatever is not already set."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent  # server/
load_dotenv(ROOT / '.env')


class Config:
    # `or` so an empty line in .env means "use the default"
    SECRET_KEY = os.environ.get('SECRET_KEY') or None
    MONGO_URL = os.environ.get('MONGO_URL') or 'mongodb://localhost:27017/archivum'
    UPLOADS_DIR = os.environ.get('UPLOADS_DIR') or ROOT / 'uploads'
    # origins allowed to call the API from another site (the client's VITE_API_URL); empty: same origin only
    CORS_ORIGINS = [o.strip().rstrip('/') for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]
    MAX_CONTENT_LENGTH = 200 * 1024 * 1024
    SOCK_SERVER_OPTIONS = {'ping_interval': 25, 'max_message_size': 2048}


def dev_secret():
    f = ROOT / '.secret'  # dev: keep a random key on disk so logins survive restarts
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text()

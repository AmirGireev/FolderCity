# Signed tokens for logged-in users.
import base64
import hashlib
import hmac
import json
import time

from app.config import SECRET_KEY

TOKEN_LIFETIME_SECONDS = 3600


def _sign(payload):
    return hmac.new(SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def issue_session_token(user_id):
    body = json.dumps({"uid": user_id, "exp": time.time() + TOKEN_LIFETIME_SECONDS}).encode()
    encoded = base64.urlsafe_b64encode(body)
    return encoded.decode() + "." + _sign(encoded)


def read_session_token(token):
    encoded, _, signature = token.partition(".")
    if not hmac.compare_digest(signature, _sign(encoded.encode())):
        return None
    data = json.loads(base64.urlsafe_b64decode(encoded))
    return data if data["exp"] > time.time() else None

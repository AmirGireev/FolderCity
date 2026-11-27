# Logs users in.
import hashlib
import hmac

from app.auth.tokens import issue_session_token
from app.users.repository import find_user_by_name


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)


def passwords_match(stored_hash, password, salt):
    return hmac.compare_digest(stored_hash, hash_password(password, salt))


def login_user(username, password):
    user = find_user_by_name(username)
    if user is None:
        raise PermissionError("unknown user")
    if not passwords_match(user["password_hash"], password, user["salt"]):
        raise PermissionError("wrong password")
    return {"token": issue_session_token(user["id"])}

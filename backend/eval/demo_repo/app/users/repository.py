# Database access for users.
import sqlite3

from app.config import DATABASE_URL


def _connect():
    return sqlite3.connect(DATABASE_URL.replace("sqlite:///", ""))


def find_user_by_id(user_id):
    with _connect() as conn:
        row = conn.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return None if row is None else {"id": row[0], "name": row[1], "email": row[2]}


def find_user_by_name(name):
    with _connect() as conn:
        row = conn.execute("SELECT id, password_hash, salt FROM users WHERE name = ?", (name,)).fetchone()
    return None if row is None else {"id": row[0], "password_hash": row[1], "salt": row[2]}


def insert_user(name, email, password_hash, salt):
    with _connect() as conn:
        conn.execute("INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)", (name, email, password_hash, salt))

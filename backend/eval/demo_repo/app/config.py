# Settings of the demo shop.
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///shop.db")
SECRET_KEY = os.environ["SECRET_KEY"]
SMTP_HOST = os.environ.get("SMTP_HOST", "localhost")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "25"))
PAYMENT_API_URL = os.environ.get("PAYMENT_API_URL", "https://payments.example.com/v1")
DEBUG = os.environ.get("DEBUG", "0") == "1"


def get_setting(name, default=None):
    return os.environ.get(name, default)

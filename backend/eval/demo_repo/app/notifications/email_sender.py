# Sends emails to customers.
import smtplib
from email.message import EmailMessage

from app.config import SMTP_HOST, SMTP_PORT
from app.notifications.templates import render_welcome


def send_welcome_message(name, address):
    message = EmailMessage()
    message["To"] = address
    message["From"] = "hello@shop.example"
    message["Subject"] = "Welcome to the shop"
    message.set_content(render_welcome(name))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.send_message(message)

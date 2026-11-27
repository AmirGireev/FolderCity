# Input checks for user data.
import re

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")


def is_valid_email(address):
    return bool(EMAIL_PATTERN.match(address or ""))


def check_password_strength(password):
    problems = []
    if len(password) < 10:
        problems.append("too short")
    if password.lower() == password:
        problems.append("needs an uppercase letter")
    if not any(ch.isdigit() for ch in password):
        problems.append("needs a digit")
    return problems

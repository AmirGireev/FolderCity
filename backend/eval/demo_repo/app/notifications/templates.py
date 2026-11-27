# Texts of the emails.
WELCOME_TEXT = "Hi {name},\n\nthanks for joining us. Your first order ships for free.\n"


def render_welcome(name):
    return WELCOME_TEXT.format(name=name)


def render_receipt(order_id, total):
    return f"Order {order_id}: {total:.2f} EUR"

# Payments with the payment provider.
import requests

from app.config import PAYMENT_API_URL
from app.utils.retry import with_retries


@with_retries(attempts=3)
def charge_card(card_token, amount_cents):
    response = requests.post(
        PAYMENT_API_URL + "/charges",
        json={"source": card_token, "amount": amount_cents, "currency": "eur"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["id"]


def refund_payment(charge_id):
    response = requests.post(PAYMENT_API_URL + "/refunds", json={"charge": charge_id}, timeout=10)
    response.raise_for_status()

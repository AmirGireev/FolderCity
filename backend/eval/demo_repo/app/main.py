# The web routes of the demo shop.
from fastapi import FastAPI

from app.auth.login import login_user
from app.orders.checkout import calculate_total
from app.users.repository import find_user_by_id

app = FastAPI()


@app.post("/login")
def login(payload: dict):
    return login_user(payload["username"], payload["password"])


@app.get("/users/{user_id}")
def get_user(user_id: int):
    return find_user_by_id(user_id)


@app.post("/orders/total")
def order_total(payload: dict):
    return {"total": calculate_total(payload["items"], payload.get("coupon"))}

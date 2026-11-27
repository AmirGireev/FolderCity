# Prices of an order.
from app.shipping.rates import shipping_cost

COUPONS = {"SPRING10": 0.10, "VIP25": 0.25}


def apply_coupon(subtotal, coupon_code):
    rate = COUPONS.get((coupon_code or "").upper(), 0)
    return round(subtotal * (1 - rate), 2)


def calculate_total(items, coupon_code=None):
    subtotal = sum(item["price"] * item["quantity"] for item in items)
    weight = sum(item.get("weight", 0) * item["quantity"] for item in items)
    discounted = apply_coupon(subtotal, coupon_code)
    return discounted + shipping_cost(weight, "domestic")

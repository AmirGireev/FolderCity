# Shipping prices.
ZONE_PRICES = {"domestic": 4.90, "europe": 9.90, "world": 19.90}
FREE_SHIPPING_WEIGHT = 0


def shipping_cost(weight_kg, zone):
    base = ZONE_PRICES[zone]
    if weight_kg <= FREE_SHIPPING_WEIGHT:
        return 0.0
    extra = max(0, weight_kg - 2) * 1.5
    return round(base + extra, 2)

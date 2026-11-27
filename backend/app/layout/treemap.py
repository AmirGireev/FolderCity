# Squarified treemap: splits a rectangle into tiles whose areas follow the given weights.
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float


def _worst(total: float, biggest: float, smallest: float, side: float) -> float:
    total_sq = total * total
    side_sq = side * side
    return max(side_sq * biggest / total_sq, total_sq / (side_sq * smallest))


def squarify(weights: list[float], rect: Rect) -> list[Rect]:
    if rect.w <= 0 or rect.h <= 0:
        raise ValueError("rect must have a positive width and height")
    if any(w <= 0 for w in weights):
        raise ValueError("weights must be positive")
    count = len(weights)
    if count == 0:
        return []

    scale = rect.w * rect.h / sum(weights)
    areas = [w * scale for w in weights]
    tiles: list[Rect] = []
    x, y, w, h = rect.x, rect.y, rect.w, rect.h
    i = 0
    while i < count:
        side = min(w, h)
        j = i + 1
        total = biggest = smallest = areas[i]
        while j < count:
            new_total = total + areas[j]
            new_big = max(biggest, areas[j])
            new_small = min(smallest, areas[j])
            if _worst(new_total, new_big, new_small, side) > _worst(total, biggest, smallest, side):
                break
            total, biggest, smallest = new_total, new_big, new_small
            j += 1
        is_last_row = j == count
        if w >= h:
            col_w = w if is_last_row else total / h
            cursor = y
            for k in range(i, j):
                item_h = (y + h - cursor) if k == j - 1 else h * areas[k] / total
                tiles.append(Rect(x, cursor, col_w, item_h))
                cursor += item_h
            x += col_w
            w -= col_w
        else:
            row_h = h if is_last_row else total / w
            cursor = x
            for k in range(i, j):
                item_w = (x + w - cursor) if k == j - 1 else w * areas[k] / total
                tiles.append(Rect(cursor, y, item_w, row_h))
                cursor += item_w
            y += row_h
            h -= row_h
        i = j
    return tiles

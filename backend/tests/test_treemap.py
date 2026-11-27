# Tests the squarified treemap algorithm.
import random

import pytest

from app.layout.treemap import Rect, squarify

EPS = 1e-9


def overlaps(a: Rect, b: Rect) -> bool:
    return a.x < b.x + b.w - EPS and b.x < a.x + a.w - EPS and a.y < b.y + b.h - EPS and b.y < a.y + a.h - EPS


def check_tiles(tiles: list[Rect], weights: list[float], rect: Rect) -> None:
    assert len(tiles) == len(weights)
    for tile in tiles:
        assert tile.w > 0 and tile.h > 0
        assert tile.x >= rect.x - EPS and tile.y >= rect.y - EPS
        assert tile.x + tile.w <= rect.x + rect.w + EPS
        assert tile.y + tile.h <= rect.y + rect.h + EPS
    for i, a in enumerate(tiles):
        for b in tiles[i + 1 :]:
            assert not overlaps(a, b)
    assert sum(t.w * t.h for t in tiles) == pytest.approx(rect.w * rect.h)
    total = sum(weights)
    for tile, weight in zip(tiles, weights):
        assert tile.w * tile.h == pytest.approx(rect.w * rect.h * weight / total)


def test_empty_list_gives_no_tiles():
    assert squarify([], Rect(0, 0, 10, 10)) == []


def test_single_weight_fills_rect():
    assert squarify([5], Rect(2, 3, 10, 4)) == [Rect(2, 3, 10, 4)]


def test_areas_are_proportional_and_tiles_do_not_overlap():
    weights = [6, 6, 4, 3, 2, 2, 1]
    rect = Rect(0, 0, 60, 40)
    check_tiles(squarify(weights, rect), weights, rect)


def test_random_inputs_keep_all_rules():
    rng = random.Random(7)
    for _ in range(200):
        weights = sorted((rng.uniform(0.1, 100) for _ in range(rng.randint(1, 30))), reverse=True)
        rect = Rect(rng.uniform(-5, 5), rng.uniform(-5, 5), rng.uniform(1, 80), rng.uniform(1, 80))
        check_tiles(squarify(weights, rect), weights, rect)


def test_tiles_stay_reasonably_square():
    tiles = squarify([1] * 16, Rect(0, 0, 40, 40))
    assert all(max(t.w / t.h, t.h / t.w) < 1.5 for t in tiles)


@pytest.mark.parametrize("rect", [Rect(0, 0, 0, 5), Rect(0, 0, 5, -1)])
def test_bad_rect_is_rejected(rect):
    with pytest.raises(ValueError):
        squarify([1], rect)


def test_non_positive_weight_is_rejected():
    with pytest.raises(ValueError):
        squarify([1, 0], Rect(0, 0, 5, 5))

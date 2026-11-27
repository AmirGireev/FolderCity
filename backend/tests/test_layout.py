# Tests the city layout: roles, heights, containment and no overlapping rectangles.
import json
import math
import random

import pytest
from jsonschema import Draft202012Validator

from app.layout import LayoutError, build_city
from app.layout.city import (
    EMPTY_FILE_HEIGHT,
    FOLDER_GAP,
    HEIGHT_SQRT_SCALE,
    MAX_BUILDING_HEIGHT,
    MIN_BUILDING_HEIGHT,
    PLATFORM_HEIGHT,
)
from app.scan.model import ScanFile, ScanResult
from fixture_tree import EXPECTED, SCHEMA_DIR

EPS = 1e-9
SCHEMA = json.loads((SCHEMA_DIR / "citymodel.schema.json").read_text(encoding="utf-8"))
validator = Draft202012Validator(SCHEMA)


def make_scan(files: dict[str, str], directories: list[str] | None = None) -> ScanResult:
    scan_files = [
        ScanFile(path=p, size=len(c.encode()), content=c, omitted=None, isEmpty=c.strip() == "")
        for p, c in files.items()
    ]
    return ScanResult(
        rootName="proj", directories=directories or [], emptyDirectories=[], files=scan_files, truncated=False
    )


def by_path(city) -> dict:
    return {n.path: n for n in city.nodes}


def rect_of(node):
    d = node.dimensions
    return d.position.x, d.position.z, d.position.x + d.width, d.position.z + d.depth


def overlap(a, b) -> bool:
    ax0, az0, ax1, az1 = rect_of(a)
    bx0, bz0, bx1, bz1 = rect_of(b)
    return ax0 < bx1 - EPS and bx0 < ax1 - EPS and az0 < bz1 - EPS and bz0 < az1 - EPS


def contains(parent, child) -> bool:
    px0, pz0, px1, pz1 = rect_of(parent)
    cx0, cz0, cx1, cz1 = rect_of(child)
    return cx0 >= px0 - EPS and cz0 >= pz0 - EPS and cx1 <= px1 + EPS and cz1 <= pz1 + EPS


def assert_no_overlaps(city) -> None:
    nodes = {n.id: n for n in city.nodes}
    children: dict[str, list] = {}
    for n in city.nodes:
        if n.parentId is not None:
            children.setdefault(n.parentId, []).append(n)
    for parent_id, kids in children.items():
        parent = nodes[parent_id]
        for i, a in enumerate(kids):
            assert contains(parent, a), f"{a.path} leaves {parent.path}"
            for b in kids[i + 1 :]:
                assert not overlap(a, b), f"{a.path} overlaps {b.path}"


def test_output_matches_the_schema_and_is_a_valid_model():
    city = build_city(make_scan({"a.py": "x\n", "src/b.py": "y\n"}))
    validator.validate(city.to_json_dict())


def test_roles_follow_the_scan_data():
    scan = make_scan({"src/main.py": "print(1)\n", "src/blank.py": "  \n"}, ["src", "empty", "src/inner"])
    nodes = by_path(build_city(scan))
    assert nodes[""].type == "folder"
    assert nodes["src"].type == "folder"
    assert nodes["src/main.py"].type == "file"
    assert nodes["src/blank.py"].type == "empty_file"
    assert nodes["empty"].type == "empty_folder"
    assert nodes["src/inner"].type == "empty_folder"


def test_heights_grow_with_square_root_with_line_counts():
    scan = make_scan(
        {"small.py": "a\n", "big.py": "x\n" * 300, "huge.py": "x\n" * 100000, "blank.py": ""}, ["gap"]
    )
    nodes = by_path(build_city(scan))
    heights = {name: nodes[name].dimensions.height for name in ("small.py", "big.py", "huge.py")}
    assert heights["small.py"] == pytest.approx(MIN_BUILDING_HEIGHT + HEIGHT_SQRT_SCALE * math.sqrt(1))
    assert heights["big.py"] == pytest.approx(MIN_BUILDING_HEIGHT + HEIGHT_SQRT_SCALE * math.sqrt(300))
    assert heights["small.py"] < heights["big.py"] < heights["huge.py"] <= MAX_BUILDING_HEIGHT
    assert heights["huge.py"] > 3 * heights["big.py"] or heights["huge.py"] == MAX_BUILDING_HEIGHT
    assert nodes["blank.py"].dimensions.height == EMPTY_FILE_HEIGHT
    assert nodes[""].dimensions.height == PLATFORM_HEIGHT
    assert nodes["gap"].dimensions.height == 0


def test_files_without_text_get_the_minimum_height():
    scan = ScanResult(
        rootName="p", directories=[], emptyDirectories=[], truncated=False,
        files=[ScanFile(path="logo.png", size=10, content=None, omitted="binary", isEmpty=False)],
    )  # fmt: skip
    assert by_path(build_city(scan))["logo.png"].dimensions.height == MIN_BUILDING_HEIGHT


def test_nesting_level_is_stored_as_depth_metric():
    nodes = by_path(build_city(make_scan({"a/b/c.py": "x\n", "top.py": "y\n"})))
    assert nodes[""].metrics.depth == 0
    assert nodes["top.py"].metrics.depth == 1
    assert nodes["a"].metrics.depth == 1
    assert nodes["a/b"].metrics.depth == 2
    assert nodes["a/b/c.py"].metrics.depth == 3


def test_sibling_folders_keep_a_clear_gap():
    nodes = by_path(build_city(make_scan({"d1/a.py": "x" * 40000, "d2/b.py": "x" * 40000, "c.py": "x" * 40000})))
    ax0, az0, ax1, az1 = rect_of(nodes["d1"])
    bx0, bz0, bx1, bz1 = rect_of(nodes["d2"])
    gap = max(bx0 - ax1, ax0 - bx1, bz0 - az1, az0 - bz1)
    assert gap >= FOLDER_GAP - 1e-6


def test_children_stand_on_top_of_their_parent():
    nodes = by_path(build_city(make_scan({"a/b/c.py": "x\n"})))
    assert nodes[""].dimensions.position.y == 0
    assert nodes["a"].dimensions.position.y == PLATFORM_HEIGHT
    assert nodes["a/b"].dimensions.position.y == 2 * PLATFORM_HEIGHT
    assert nodes["a/b/c.py"].dimensions.position.y == 3 * PLATFORM_HEIGHT


def test_small_files_stay_visible():
    files = {f"tiny{i}.py": "x" for i in range(50)}
    files["big.py"] = "x\n" * 5000
    for node in build_city(make_scan(files)).nodes:
        assert node.dimensions.width > 0.5 and node.dimensions.depth > 0.5
        assert node.dimensions.height > 0


def test_bigger_files_get_more_area_and_folders_hold_more_files():
    scan = make_scan({"big.py": "x" * 10000, "small.py": "x", "dir/a.py": "x", "dir/b.py": "x"})
    nodes = by_path(build_city(scan))

    def area(n):
        return n.dimensions.width * n.dimensions.depth

    assert area(nodes["big.py"]) > area(nodes["small.py"])
    assert nodes["dir"].metrics.fileCount == 2
    assert nodes[""].metrics.fileCount == 4


def test_file_metrics():
    node = by_path(build_city(make_scan({"src/app.tsx": "a\nb\nc"})))["src/app.tsx"]
    assert node.metrics.lines == 3
    assert node.metrics.extension == ".tsx"
    assert node.metrics.language == "typescript"
    assert node.metrics.sizeBytes == 5


def test_no_rectangles_overlap_for_the_shared_fixture():
    expected = ScanResult.model_validate(EXPECTED)
    city = build_city(expected)
    assert_no_overlaps(city)
    types = {n.path: n.type for n in city.nodes}
    for path in expected.emptyDirectories:
        assert types[path] == "empty_folder"
    for file in expected.files:
        assert types[file.path] == ("empty_file" if file.isEmpty else "file")


def test_no_rectangles_overlap_for_random_trees():
    rng = random.Random(42)
    names = ["a", "b", "c", "d", "e"]
    for _ in range(40):
        files = {}
        for _ in range(rng.randint(1, 60)):
            depth = rng.randint(0, 4)
            folder = "/".join(rng.choice(names) for _ in range(depth))
            name = f"f{rng.randint(0, 999)}.py"
            files[f"{folder}/{name}" if folder else name] = "x\n" * rng.choice([0, 1, 10, 500, 4000])
        dirs = ["/".join(rng.choice(names) for _ in range(rng.randint(1, 4))) for _ in range(rng.randint(0, 8))]
        city = build_city(make_scan(files, sorted(set(dirs))))
        assert_no_overlaps(city)


def test_empty_scan_gives_single_root():
    city = build_city(ScanResult(rootName="x", directories=[], emptyDirectories=[], files=[], truncated=False))
    assert [n.path for n in city.nodes] == [""]
    assert city.nodes[0].type == "empty_folder"
    assert city.rootId == city.nodes[0].id


def test_parent_folders_missing_from_directories_are_created():
    nodes = by_path(build_city(make_scan({"x/y/z.py": "1"})))
    assert {"", "x", "x/y", "x/y/z.py"} <= set(nodes)


def test_layout_is_deterministic():
    scan = make_scan({"a.py": "x\n", "b.py": "x\n", "d/c.py": "y\n"})
    assert build_city(scan).to_json_dict() == build_city(scan).to_json_dict()


@pytest.mark.parametrize("path", ["../evil.py", "/abs.py", "a//b.py", "a/./b.py", "a\\b.py"])
def test_bad_paths_are_rejected(path):
    with pytest.raises(LayoutError):
        build_city(make_scan({path: "x"}))


def test_file_and_folder_with_same_path_is_rejected():
    with pytest.raises(LayoutError):
        build_city(make_scan({"a": "x"}, ["a"]))
    with pytest.raises(LayoutError):
        build_city(make_scan({"a": "x", "a/b.py": "y"}))

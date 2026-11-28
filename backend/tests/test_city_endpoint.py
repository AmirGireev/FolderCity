# Tests the POST /city endpoint.
from fastapi.testclient import TestClient

from app.main import app
from fixture_tree import EXPECTED

client = TestClient(app)


def test_city_returns_layout_for_scan_format():
    response = client.post("/city", json=EXPECTED)
    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "1.0"
    assert body["rootId"] in {n["id"] for n in body["nodes"]}
    assert len(body["nodes"]) == 1 + len(EXPECTED["directories"]) + len(EXPECTED["files"])
    root = next(n for n in body["nodes"] if n["id"] == body["rootId"])
    assert root["parentId"] is None


def test_invalid_scan_gives_422():
    assert client.post("/city", json={"rootName": "x"}).status_code == 422


def test_bad_path_gives_422():
    scan = {**EXPECTED, "files": [{"path": "../x", "size": 1, "content": "a", "omitted": None, "isEmpty": False}]}
    response = client.post("/city", json=scan)
    assert response.status_code == 422
    assert "invalid path" in response.json()["detail"]


def test_city_contains_import_edges_and_symbols():
    scan = {
        "schemaVersion": "1.0", "rootName": "p", "directories": [], "emptyDirectories": [], "truncated": False,
        "files": [
            {"path": "main.py", "size": 30, "content": "import util\n\ndef main():\n    pass\n", "omitted": None, "isEmpty": False},
            {"path": "util.py", "size": 10, "content": "X = 1\n", "omitted": None, "isEmpty": False},
        ],
    }  # fmt: skip
    body = client.post("/city", json=scan).json()
    assert body["edges"] == [{"source": "main.py", "target": "util.py", "line": 1}]
    assert [(s["fileId"], s["kind"], s["name"], s["startLine"], s["endLine"]) for s in body["symbols"]] == [
        ("main.py", "function", "main", 3, 4)
    ]
    ids = {n["id"] for n in body["nodes"]}
    assert {"main.py", "util.py"} <= ids


def test_city_contains_architecture_elements():
    scan = {
        "schemaVersion": "1.0", "rootName": "p", "directories": [], "emptyDirectories": [], "truncated": False,
        "files": [
            {"path": "api.py", "size": 40, "content": "@app.get(\"/items\")\ndef items():\n    pass\n", "omitted": None, "isEmpty": False},
            {"path": "Dockerfile", "size": 30, "content": "FROM python:3.12\nEXPOSE 8000\n", "omitted": None, "isEmpty": False},
        ],
    }  # fmt: skip
    body = client.post("/city", json=scan).json()
    assert [(a["kind"], a["label"], a["fileId"], a["line"]) for a in body["architecture"]] == [
        ("server", "Dockerfile: python:3.12 (port 8000)", "Dockerfile", 1),
        ("api", "GET /items", "api.py", 1),
    ]


def test_city_contains_complexity_cycles_blast_radius_and_findings():
    code_a = "import b\n\n\ndef f(x):\n    if x and x > 1:\n        return b.g(x)\n    return 0\n"
    code_b = "import a\n\n\ndef g(x):\n    return eval(x)\n"
    scan = {
        "schemaVersion": "1.0", "rootName": "p", "directories": [], "emptyDirectories": [], "truncated": False,
        "files": [
            {"path": "a.py", "size": len(code_a), "content": code_a, "omitted": None, "isEmpty": False},
            {"path": "b.py", "size": len(code_b), "content": code_b, "omitted": None, "isEmpty": False},
            {"path": "c.py", "size": 10, "content": "import a\n", "omitted": None, "isEmpty": False},
        ],
    }  # fmt: skip
    body = client.post("/city", json=scan).json()
    nodes = {n["id"]: n for n in body["nodes"]}
    assert nodes["a.py"]["metrics"]["complexity"] == 3
    assert nodes["a.py"]["metrics"]["cycle"] == nodes["b.py"]["metrics"]["cycle"] == 1
    assert nodes["a.py"]["metrics"]["cycleSize"] == 2
    assert "cycle" not in nodes["c.py"]["metrics"]
    assert nodes["a.py"]["metrics"]["blastRadius"] == 2
    assert {s["name"]: s["complexity"] for s in body["symbols"]} == {"f": 3, "g": 1}
    assert any(f["fileId"] == "b.py" and f["line"] == 5 and f["severity"] == "high" for f in body["findings"])
    assert all(set(f) == {"id", "fileId", "line", "rule", "message", "severity", "source"} for f in body["findings"])

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

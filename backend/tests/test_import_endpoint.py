from fastapi.testclient import TestClient

from app import main
from app.scan.github import GithubImportError
from app.scan.model import ScanResult

client = TestClient(main.app)


def test_invalid_url_gives_400():
    response = client.post("/import/github", json={"url": "https://evil.com/a/b"})
    assert response.status_code == 400
    assert "github.com" in response.json()["detail"]


def test_missing_url_gives_422():
    assert client.post("/import/github", json={}).status_code == 422


def test_success_returns_scan_format(monkeypatch):
    scan = ScanResult(rootName="repo", directories=[], emptyDirectories=[], files=[], truncated=False)
    monkeypatch.setattr(main, "import_github", lambda url: scan)
    response = client.post("/import/github", json={"url": "https://github.com/a/repo"})
    assert response.status_code == 200
    assert response.json() == {
        "schemaVersion": "1.0", "rootName": "repo", "directories": [],
        "emptyDirectories": [], "files": [], "truncated": False,
    }  # fmt: skip


def test_clone_errors_are_passed_on(monkeypatch):
    def fail(url):
        raise GithubImportError(502, "nicht gefunden")

    monkeypatch.setattr(main, "import_github", fail)
    response = client.post("/import/github", json={"url": "https://github.com/a/repo"})
    assert response.status_code == 502
    assert response.json() == {"detail": "nicht gefunden"}

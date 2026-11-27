# Tests the chunk stores (memory and Postgres), the indexing service and the assistant endpoints.
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.ai.chunking import Chunk
from app.ai.embeddings import HashingEmbedder
from app.ai.limits import RateLimiter
from app.ai.service import AssistantService, get_service
from app.ai.store import MemoryStore, PgStore, RepoInfo
from app.main import app
from app.models import ArchitectureNode

INFO = RepoInfo(
    "demo",
    {"a.py": 10, "b.py": 20},
    [ArchitectureNode(id="api:GET /x@a.py", kind="api", label="GET /x", fileId="a.py", line=3)],
)
CHUNKS = [
    Chunk("a.py", 1, 5, "alpha", "def alpha(): ..."),
    Chunk("b.py", 1, 9, None, "import os\n\nprint('hello')"),
    Chunk("b.py", 10, 20, "Beta.go", "def go(): ..."),
]
VECTORS = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def exercise(store) -> None:
    repo = f"repo-{uuid.uuid4().hex}"
    assert not store.has_repo(repo)
    assert store.repo_info(repo) is None and store.chunks(repo) == []
    store.save_repo(repo, INFO, CHUNKS, VECTORS)
    assert store.has_repo(repo)
    info = store.repo_info(repo)
    assert info.root_name == "demo" and info.files == INFO.files and info.architecture == INFO.architecture
    assert sorted(store.chunks(repo), key=lambda c: c.key) == sorted(CHUNKS, key=lambda c: c.key)
    nearest = store.vector_search(repo, [0.0, 0.9, 0.1], 2)
    assert nearest[0] == CHUNKS[1] and len(nearest) == 2
    store.save_repo(repo, INFO, CHUNKS[:1], VECTORS[:1])
    assert len(store.chunks(repo)) == 1
    keyword_only = f"repo-{uuid.uuid4().hex}"
    store.save_repo(keyword_only, INFO, CHUNKS, None)
    assert len(store.chunks(keyword_only)) == 3
    assert store.vector_search(keyword_only, [1.0, 0.0, 0.0], 3) == []


def test_memory_store():
    exercise(MemoryStore())


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs TEST_DATABASE_URL (Postgres with pgvector)")
def test_postgres_store():
    exercise(PgStore(os.environ["TEST_DATABASE_URL"], 3))


# ---- service --------------------------------------------------------------------------------------------------

def make_service(embedder=None, llm=None, ask_limit=100):
    return AssistantService(
        MemoryStore(), embedder, llm, RateLimiter([(ask_limit, 60)]), RateLimiter([(100, 60)])
    )


class BrokenEmbedder:
    model_name = "broken"
    dimension = 8

    def embed(self, texts):
        raise RuntimeError("model download failed")


def scan_body(files: dict[str, str]) -> dict:
    return {
        "schemaVersion": "1.0", "rootName": "p", "directories": [], "emptyDirectories": [], "truncated": False,
        "files": [{"path": p, "size": len(c), "content": c, "omitted": None, "isEmpty": not c.strip()} for p, c in files.items()],
    }  # fmt: skip


FILES = {
    "a.py": "def check_email(address):\n    return '@' in address\n",
    "b.py": "def charge(token):\n    return token\n",
}


@pytest.fixture
def client():
    service = make_service(HashingEmbedder(64))
    app.dependency_overrides[get_service] = lambda: service
    yield TestClient(app), service
    app.dependency_overrides.clear()


def test_index_then_ask(client):
    http, _ = client
    index = http.post("/index", json=scan_body(FILES))
    assert index.status_code == 200
    body = index.json()
    assert body["cached"] is False and body["searchMode"] == "hybrid" and body["chunks"] >= 2
    answer = http.post("/ask", json={"repoHash": body["repoHash"], "question": "Where is the email checked?"})
    assert answer.status_code == 200
    data = answer.json()
    assert data["mode"] == "search" and data["references"][0]["file"] == "a.py"
    assert set(data["references"][0]) == {"file", "startLine", "endLine"}


def test_indexing_the_same_repo_again_uses_the_cache(client):
    http, _ = client
    first = http.post("/index", json=scan_body(FILES)).json()
    second = http.post("/index", json=scan_body(FILES)).json()
    assert second["cached"] is True and second["repoHash"] == first["repoHash"]
    changed = http.post("/index", json=scan_body({**FILES, "a.py": "x = 1\n"})).json()
    assert changed["repoHash"] != first["repoHash"] and changed["cached"] is False


def test_unknown_repo_gives_404_and_bad_questions_422(client):
    http, _ = client
    assert http.post("/ask", json={"repoHash": "nope", "question": "Where?"}).status_code == 404
    repo = http.post("/index", json=scan_body(FILES)).json()["repoHash"]
    assert http.post("/ask", json={"repoHash": repo, "question": ""}).status_code == 422
    assert http.post("/ask", json={"repoHash": repo, "question": "x" * 600}).status_code == 422
    assert http.post("/ask", json={"repoHash": repo, "question": "x" * 5000}).status_code == 422
    assert http.post("/ask", json={"question": "Where?"}).status_code == 422


def test_the_ask_endpoint_is_rate_limited_per_client():
    service = make_service(None, None, ask_limit=2)
    app.dependency_overrides[get_service] = lambda: service
    try:
        http = TestClient(app)
        repo = http.post("/index", json=scan_body(FILES)).json()["repoHash"]
        codes = [http.post("/ask", json={"repoHash": repo, "question": f"email {i}"}).status_code for i in range(4)]
        assert codes == [200, 200, 429, 429]
        blocked = http.post("/ask", json={"repoHash": repo, "question": "again"})
        assert "Too many requests" in blocked.json()["detail"] and int(blocked.headers["Retry-After"]) >= 1
    finally:
        app.dependency_overrides.clear()


def test_the_index_endpoint_is_rate_limited():
    service = AssistantService(MemoryStore(), None, None, RateLimiter([(10, 60)]), RateLimiter([(1, 60)]))
    app.dependency_overrides[get_service] = lambda: service
    try:
        http = TestClient(app)
        assert http.post("/index", json=scan_body(FILES)).status_code == 200
        assert http.post("/index", json=scan_body(FILES)).status_code == 429
    finally:
        app.dependency_overrides.clear()


def test_too_large_repos_are_refused(client):
    http, _ = client
    many = {f"f{i}.py": "x = 1\n" for i in range(601)}
    assert http.post("/index", json=scan_body(many)).status_code == 413


def test_a_failing_embedder_falls_back_to_keyword_search():
    service = make_service(BrokenEmbedder())
    app.dependency_overrides[get_service] = lambda: service
    try:
        http = TestClient(app)
        body = http.post("/index", json=scan_body(FILES)).json()
        assert body["searchMode"] == "keyword"
        answer = http.post("/ask", json={"repoHash": body["repoHash"], "question": "check email"}).json()
        assert answer["references"][0]["file"] == "a.py"
    finally:
        app.dependency_overrides.clear()


def test_status_tells_what_is_configured(client):
    http, service = client
    assert http.get("/assistant/status").json() == {"ai": False, "embeddings": True}
    assert service.status == {"ai": False, "embeddings": True}


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs TEST_DATABASE_URL (Postgres with pgvector)")
def test_postgres_store_rebuilds_the_cache_when_the_vector_size_changes():
    url = os.environ["TEST_DATABASE_URL"]
    PgStore(url, 3).save_repo("old", INFO, CHUNKS, VECTORS)
    wider = PgStore(url, 5)
    assert not wider.has_repo("old")
    wider.save_repo("new", INFO, CHUNKS, [[0.1] * 5 for _ in CHUNKS])
    assert len(wider.chunks("new")) == 3
    PgStore(url, 3).has_repo("x")

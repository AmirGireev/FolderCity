# Tests chunking, repo hashes, keyword search, rank fusion and hybrid search.
import pytest

from app.ai.chunking import (
    HEADER_LINES,
    MAX_CLASS_LINES,
    MAX_FUNCTION_LINES,
    MAX_WINDOWS,
    WINDOW_LINES,
    Chunk,
    build_chunks,
    line_counts,
    repo_hash,
)
from app.ai.embeddings import HashingEmbedder, cosine, split_words
from app.ai.search import hybrid_search, keyword_search, question_terms, reciprocal_rank_fusion
from app.ai.store import MemoryStore, RepoInfo
from app.analysis.symbols import extract_symbols
from app.models import ArchitectureNode
from app.scan.model import ScanFile


def scan_file(path: str, content: str | None, omitted=None) -> ScanFile:
    return ScanFile(path=path, size=len(content or ""), content=content, omitted=omitted, isEmpty=not (content or "").strip())


def chunks_for(files: dict[str, str]) -> list[Chunk]:
    scanned = [scan_file(p, c) for p, c in files.items()]
    symbols = [s for f in scanned if f.content for s in extract_symbols(f.path, f.content)]
    return build_chunks(scanned, symbols)


PYTHON = "import os\nimport sys\n\n\ndef first():\n    return 1\n\n\nclass Box:\n    def open(self):\n        return 2\n"


def test_one_chunk_per_function_class_and_method_plus_a_header():
    chunks = chunks_for({"a.py": PYTHON})
    assert [(c.symbol, c.start_line, c.end_line) for c in chunks] == [
        (None, 1, 4), ("first", 5, 6), ("Box", 9, 11), ("Box.open", 10, 11),
    ]  # fmt: skip
    assert chunks[1].content == "def first():\n    return 1"
    assert all(c.file_path == "a.py" for c in chunks)


def test_files_without_symbols_are_cut_into_windows():
    text = "\n".join(f"line {i}" for i in range(1, 121))
    chunks = chunks_for({"notes.txt": text})
    assert [(c.start_line, c.end_line) for c in chunks] == [(1, 50), (51, 100), (101, 120)]
    assert all(c.symbol is None for c in chunks)


def test_windows_stop_at_the_maximum():
    text = "\n".join(f"x{i}" for i in range(WINDOW_LINES * (MAX_WINDOWS + 3)))
    assert len(chunks_for({"big.txt": text})) == MAX_WINDOWS


def test_long_functions_and_classes_are_capped():
    body = "\n".join(f"    x{i} = {i}" for i in range(200))
    chunks = chunks_for({"a.py": f"def long():\n{body}\n\nclass Big:\n{body}\n"})
    function = next(c for c in chunks if c.symbol == "long")
    klass = next(c for c in chunks if c.symbol == "Big")
    assert function.end_line - function.start_line + 1 == MAX_FUNCTION_LINES
    assert klass.end_line - klass.start_line + 1 == MAX_CLASS_LINES


def test_the_header_is_limited_and_needs_real_content():
    imports = "\n".join(f"import m{i}" for i in range(60))
    chunks = chunks_for({"a.py": f"{imports}\n\ndef f():\n    pass\n"})
    assert (chunks[0].start_line, chunks[0].end_line) == (1, HEADER_LINES)
    assert chunks_for({"b.py": "\n\n# one\n\ndef g():\n    pass\n"})[0].symbol == "g"


def test_empty_binary_and_blank_files_give_no_chunks():
    files = [scan_file("a.py", ""), scan_file("b.py", "  \n"), scan_file("c.png", None, "binary")]
    assert build_chunks(files, []) == []


def test_embedding_text_starts_with_path_and_symbol():
    chunk = Chunk("src/a.py", 1, 2, "work", "def work(): ...")
    assert chunk.embedding_text() == "src/a.py work\ndef work(): ..."
    assert Chunk("a.txt", 1, 1, None, "hi").embedding_text() == "a.txt\nhi"


def test_repo_hash_changes_with_content_paths_and_model():
    base = [scan_file("a.py", "x = 1\n"), scan_file("b.py", "y = 2\n")]
    same = [scan_file("b.py", "y = 2\n"), scan_file("a.py", "x = 1\n")]
    assert repo_hash(base, "m") == repo_hash(same, "m")
    assert repo_hash(base, "m") != repo_hash(base, "other-model")
    assert repo_hash(base, "m") != repo_hash([scan_file("a.py", "x = 2\n"), base[1]], "m")
    assert repo_hash(base, "m") != repo_hash([scan_file("c.py", "x = 1\n"), base[1]], "m")


def test_line_counts():
    assert line_counts([scan_file("a.py", "a\nb\nc\n"), scan_file("b.png", None, "binary")]) == {"a.py": 3}


def test_split_words_handles_camel_and_snake_case():
    assert split_words("validateEmail_address HTTPServer") == ["validate", "email", "address", "httpserver"]


def test_hashing_embedder_is_deterministic_and_normalized():
    embedder = HashingEmbedder(64)
    a, b = embedder.embed(["send email now", "send email now"])
    assert a == b and len(a) == 64
    assert sum(x * x for x in a) == pytest.approx(1.0)
    similar = embedder.embed(["send the email", "paint the wall"])
    assert cosine(a, similar[0]) > cosine(a, similar[1])


# ---- search ---------------------------------------------------------------------------------------------------

CODE = {
    "mail/sender.py": "def send_welcome_email(address):\n    smtp.send(address, 'welcome')\n",
    "users/check.py": "def validate_email(address):\n    return '@' in address\n",
    "pay/charge.py": "def charge_card(token):\n    return requests.post(PAYMENT_URL)\n",
    "api/routes.py": "@app.get('/orders')\ndef list_orders():\n    return []\n",
}


def test_question_terms_drop_filler_words():
    assert question_terms("Where is the email validated?") == ["email", "validated"]
    assert question_terms("Wo wird die Rechnung erstellt?") == ["rechnung", "erstellt"]


def test_keyword_search_finds_symbols_and_paths():
    chunks = chunks_for(CODE)
    top = keyword_search(chunks, "validate email")
    assert top[0].file_path == "users/check.py"
    assert keyword_search(chunks, "charge card")[0].file_path == "pay/charge.py"
    assert keyword_search(chunks, "sender")[0].file_path == "mail/sender.py"


def test_keyword_search_gives_nothing_for_unknown_or_empty_questions():
    chunks = chunks_for(CODE)
    assert keyword_search(chunks, "zebra") == []
    assert keyword_search(chunks, "the is a") == []
    assert keyword_search([], "email") == []


def test_architecture_labels_help_route_questions():
    chunks = chunks_for(CODE)
    arch = [ArchitectureNode(id="api:GET /orders@api/routes.py", kind="api", label="GET /orders", fileId="api/routes.py", line=1)]
    assert keyword_search(chunks, "orders endpoint", arch)[0].file_path == "api/routes.py"


def test_rank_fusion_prefers_chunks_found_by_both_lists():
    a, b, c = (Chunk(f"{n}.py", 1, 1, None, n) for n in "abc")
    fused = reciprocal_rank_fusion([[a, b], [c, b]])
    assert fused[0] == b
    assert {x.file_path for x in fused} == {"a.py", "b.py", "c.py"}


def test_rank_fusion_is_stable_for_ties():
    a, b = Chunk("a.py", 1, 1, None, ""), Chunk("b.py", 1, 1, None, "")
    assert reciprocal_rank_fusion([[a], [b]]) == reciprocal_rank_fusion([[a], [b]])
    assert reciprocal_rank_fusion([]) == []


def test_hybrid_search_combines_keywords_and_vectors():
    chunks = chunks_for(CODE)
    embedder = HashingEmbedder(128)
    store = MemoryStore()
    info = RepoInfo("demo", {p: 5 for p in CODE}, [])
    store.save_repo("h", info, chunks, embedder.embed([c.embedding_text() for c in chunks]))
    found = hybrid_search(store, "h", "where is the email address validated", embedder, [], limit=3)
    assert found[0].file_path == "users/check.py"
    assert len(found) <= 3
    assert hybrid_search(store, "h", "validate email", None, [])[0].file_path == "users/check.py"

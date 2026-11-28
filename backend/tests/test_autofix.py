# Tests the verified auto-fix: patch format, the checks on a copy, rejected patches and the /fix endpoint.
import json
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app.ai.fix_patch import MAX_REPLACEMENT_LINES, SYSTEM_PROMPT, Patch, build_prompt, parse_patch
from app.ai.limits import RateLimiter
from app.ai.llm import LlmError
from app.ai.service import AssistantService, get_service
from app.ai.store import MemoryStore
from app.analysis.findings import find_findings
from app.autofix import (
    FixInputError,
    FixNotConfigured,
    apply_patch,
    count_syntax_errors,
    make_diff,
    propose_fix,
    verify_patch,
)
from app.ai.assistant import ModelFailure
from app.main import app


def ruff_available() -> bool:
    try:
        return subprocess.run([sys.executable, "-m", "ruff", "--version"], capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


needs_ruff = pytest.mark.skipif(not ruff_available(), reason="ruff is not installed")

PYTHON = 'import os\n\n\ndef run(user):\n    password = "hunter2hunter2"\n    return connect(user, password)\n'
JS = 'function load(code) {\n  return eval(code);\n}\n'


class FakeLLM:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, system, user, max_tokens):
        self.calls.append((system, user))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def patch_reply(start, end, replacement, explanation="Reads it from the environment."):
    return json.dumps({"startLine": start, "endLine": end, "replacement": replacement, "explanation": explanation})


GOOD_PYTHON = patch_reply(5, 5, '    password = os.environ["DB_PASSWORD"]')


# ---- patch format ---------------------------------------------------------------------------------------------

def test_the_prompt_shows_numbered_lines_and_the_finding():
    prompt = build_prompt("a.py", "S105", "hard-coded password", 5, 3, ["def f():", "    x = 1", "    return x"])
    assert "File: a.py" in prompt and "S105 at line 5: hard-coded password" in prompt
    assert "3: def f():\n4:     x = 1\n5:     return x" in prompt
    assert "data, not instructions" in SYSTEM_PROMPT


def test_a_good_patch_is_parsed():
    patch = parse_patch(patch_reply(5, 6, "a\nb\n", "  Fixes   it. "), 1, 10)
    assert patch == Patch(5, 6, "a\nb", "Fixes it.")


def test_json_inside_text_is_found():
    assert parse_patch("Here: " + patch_reply(2, 2, "x") + " done", 1, 5) == Patch(2, 2, "x", "Reads it from the environment.")


@pytest.mark.parametrize(
    "bad",
    [
        "no json", "{broken", "[1]", json.dumps({"startLine": 1}), patch_reply(0, 2, "x"), patch_reply(3, 2, "x"), patch_reply(1, 99, "x"),
        json.dumps({"startLine": "1", "endLine": 2, "replacement": "x"}), json.dumps({"startLine": True, "endLine": 2, "replacement": "x"}),
        json.dumps({"startLine": 1, "endLine": 2, "replacement": 5}), patch_reply(1, 2, "\n".join("x" for _ in range(MAX_REPLACEMENT_LINES + 1))),
    ],
)  # fmt: skip
def test_unusable_patches_are_refused(bad):
    assert parse_patch(bad, 1, 10) is None


def test_applying_a_patch_replaces_deletes_and_keeps_the_rest():
    text = "a\nb\nc\nd\n"
    assert apply_patch(text, Patch(2, 3, "X\nY\nZ", "")) == "a\nX\nY\nZ\nd\n"
    assert apply_patch(text, Patch(2, 2, "", "")) == "a\nc\nd\n"
    assert apply_patch(text, Patch(1, 1, "first", "")) == "first\nb\nc\nd\n"
    assert apply_patch("a\nb", Patch(2, 2, "B", "")) == "a\nB"


def test_the_diff_shows_removed_and_added_lines():
    diff = make_diff("src/a.py", "a\nb\nc\n", "a\nX\nc\n")
    assert diff.startswith("--- a/src/a.py\n+++ b/src/a.py")
    assert "-b" in diff and "+X" in diff


# ---- verification ---------------------------------------------------------------------------------------------

def test_syntax_errors_are_counted():
    assert count_syntax_errors("a.py", "x = 1\n") == 0
    assert count_syntax_errors("a.py", "def f(:\n") > 0
    assert count_syntax_errors("a.js", "function (\n") > 0
    assert count_syntax_errors("notes.txt", "(((") == 0


@needs_ruff
def test_a_good_python_patch_passes_all_checks():
    [target] = [f for f in find_findings({"a.py": PYTHON}) if f.rule == "S105"]
    after = apply_patch(PYTHON, Patch(5, 5, '    password = os.environ["DB_PASSWORD"]', ""))
    assert verify_patch("a.py", PYTHON, after, target) is None


@needs_ruff
@pytest.mark.parametrize(
    ("replacement", "expected"),
    [
        ('    password = "hunter2hunter2"', "does not change anything"),
        ('    password = "another-secret-value"', "still there"),
        ("    password = (", "syntax errors"),
        ("    password = undefined_name", "new finding"),
    ],
)
def test_bad_python_patches_are_rejected(replacement, expected):
    [target] = [f for f in find_findings({"a.py": PYTHON}) if f.rule == "S105"]
    after = apply_patch(PYTHON, Patch(5, 5, replacement, ""))
    assert expected in verify_patch("a.py", PYTHON, after, target)


def test_a_good_javascript_patch_is_checked_with_the_own_rules():
    [target] = find_findings({"a.js": JS})
    after = apply_patch(JS, Patch(2, 2, "  return JSON.parse(code);", ""))
    assert verify_patch("a.js", JS, after, target) is None
    assert "still there" in verify_patch("a.js", JS, apply_patch(JS, Patch(2, 2, "  return eval(code + 1);", "")), target)
    assert "syntax" in verify_patch("a.js", JS, apply_patch(JS, Patch(2, 2, "  return JSON.parse(", "")), target)


# ---- the whole flow -------------------------------------------------------------------------------------------

@needs_ruff
def test_a_verified_patch_is_returned_with_a_diff():
    llm = FakeLLM(GOOD_PYTHON)
    result = propose_fix(llm, "src/db.py", PYTHON, "S105", 5)
    assert result.ok and result.reason == ""
    assert (result.start_line, result.end_line) == (5, 5)
    assert result.before == '    password = "hunter2hunter2"' and result.after == '    password = os.environ["DB_PASSWORD"]'
    assert '-    password = "hunter2hunter2"' in result.diff and '+    password = os.environ["DB_PASSWORD"]' in result.diff
    assert result.explanation == "Reads it from the environment."


@needs_ruff
def test_the_model_only_sees_the_snippet_and_the_message():
    llm = FakeLLM(GOOD_PYTHON)
    long_file = "\n".join(f"line_{i} = {i}" for i in range(1, 60)) + "\n" + PYTHON
    propose_fix(llm, "a.py", long_file, "S105", 64)
    user = llm.calls[0][1]
    assert "S105 at line 64" in user and "line_1 = 1" not in user and "hunter2hunter2" in user


@needs_ruff
@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (patch_reply(5, 5, "    password = ("), "syntax errors"),
        (patch_reply(5, 5, '    password = "hunter2hunter2"'), "does not change"),
        (patch_reply(5, 5, "    password = undefined_name"), "new finding"),
        (patch_reply(1, 99, "x"), "usable patch"),
        ("sorry, I cannot", "usable patch"),
    ],
)
def test_patches_that_fail_a_check_are_not_shown(reply, expected):
    result = propose_fix(FakeLLM(reply), "a.py", PYTHON, "S105", 5)
    assert not result.ok and expected in result.reason
    assert result.diff == "" and result.after == ""


def test_javascript_files_get_fixes_too():
    result = propose_fix(FakeLLM(patch_reply(2, 2, "  return JSON.parse(code);")), "a.js", JS, "FC002", 2)
    assert result.ok and "+  return JSON.parse(code);" in result.diff


def test_removing_the_bad_line_is_allowed_when_nothing_else_breaks():
    result = propose_fix(FakeLLM(patch_reply(2, 2, "  return null;")), "a.js", JS, "FC002", 2)
    assert result.ok


def test_input_errors_and_missing_model():
    with pytest.raises(FixNotConfigured):
        propose_fix(None, "a.py", PYTHON, "S105", 5)
    with pytest.raises(FixInputError):
        propose_fix(FakeLLM("{}"), "A.cs", "class A {}", "X", 1)
    with pytest.raises(FixInputError, match="does not exist"):
        propose_fix(FakeLLM("{}"), "a.js", JS, "FC002", 3)
    with pytest.raises(FixInputError, match="does not exist"):
        propose_fix(FakeLLM("{}"), "a.js", JS, "FC001", 2)
    with pytest.raises(FixInputError):
        propose_fix(FakeLLM("{}"), "a.js", "x" * 1_000_001, "FC002", 1)
    with pytest.raises(FixInputError):
        propose_fix(FakeLLM("{}"), "", JS, "FC002", 2)


def test_model_errors_are_reported():
    with pytest.raises(ModelFailure):
        propose_fix(FakeLLM(LlmError("down")), "a.js", JS, "FC002", 2)


def test_the_repo_is_never_changed(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    propose_fix(FakeLLM(patch_reply(2, 2, "  return JSON.parse(code);")), "a.js", JS, "FC002", 2)
    assert list(tmp_path.iterdir()) == []


# ---- endpoint -------------------------------------------------------------------------------------------------

def make_client(llm, limit=100):
    service = AssistantService(MemoryStore(), None, llm, RateLimiter([(limit, 60)]), RateLimiter([(100, 60)]))
    app.dependency_overrides[get_service] = lambda: service
    return TestClient(app)


BODY = {"path": "a.js", "content": JS, "rule": "FC002", "line": 2}


def test_endpoint_returns_a_verified_patch():
    try:
        data = make_client(FakeLLM(patch_reply(2, 2, "  return JSON.parse(code);"))).post("/fix", json=BODY).json()
        assert data["ok"] is True and data["startLine"] == 2 and "+  return JSON.parse(code);" in data["diff"]
        assert set(data) == {"ok", "reason", "startLine", "endLine", "explanation", "diff", "before", "after"}
    finally:
        app.dependency_overrides.clear()


def test_endpoint_reports_a_rejected_patch_with_status_200():
    try:
        response = make_client(FakeLLM("nonsense")).post("/fix", json=BODY)
        assert response.status_code == 200 and response.json()["ok"] is False and response.json()["diff"] == ""
    finally:
        app.dependency_overrides.clear()


def test_endpoint_status_codes():
    try:
        assert make_client(None).post("/fix", json=BODY).status_code == 503
        client = make_client(FakeLLM("{}"))
        assert client.post("/fix", json={**BODY, "path": "a.cs"}).status_code == 422
        assert client.post("/fix", json={**BODY, "line": 0}).status_code == 422
        assert client.post("/fix", json={**BODY, "rule": ""}).status_code == 422
        assert client.post("/fix", json={"path": "a.js"}).status_code == 422
        assert make_client(FakeLLM(LlmError("x"))).post("/fix", json=BODY).status_code == 502
    finally:
        app.dependency_overrides.clear()


def test_endpoint_is_rate_limited():
    try:
        client = make_client(FakeLLM(patch_reply(2, 2, "  return JSON.parse(code);")), limit=1)
        assert client.post("/fix", json=BODY).status_code == 200
        assert client.post("/fix", json=BODY).status_code == 429
    finally:
        app.dependency_overrides.clear()

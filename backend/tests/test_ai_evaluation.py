# Checks the hit rate of the demo questions and that the AI layer only reads finished analysis results.
import ast
import json
from pathlib import Path

from app.ai.embeddings import HashingEmbedder
from app.ai.evaluate import EVAL_DIR, evaluate

APP = Path(__file__).resolve().parents[1] / "app"


def test_the_demo_has_ten_questions_with_existing_files():
    questions = json.loads((EVAL_DIR / "questions.json").read_text(encoding="utf-8"))
    assert len(questions) == 10
    for entry in questions:
        assert (EVAL_DIR / "demo_repo" / entry["file"]).is_file()


def test_plain_search_finds_the_right_file_for_at_least_eight_questions():
    results = evaluate(HashingEmbedder(256), None)
    misses = [r.question for r in results if not r.hit]
    assert len(results) == 10
    assert sum(r.hit for r in results) >= 8, misses


def test_keyword_search_alone_is_good_enough_too():
    assert sum(r.hit for r in evaluate(None, None)) >= 8


def test_the_ai_layer_never_imports_the_analysis_code():
    for path in (APP / "ai").rglob("*.py"):
        if path.name == "evaluate.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.ImportFrom):
                names.append((node.module or "") + "." + ".".join(a.name for a in node.names))
            elif isinstance(node, ast.Import):
                names += [a.name for a in node.names]
            for name in names:
                assert "analysis" not in name.split("."), f"{path.name} imports {name}"

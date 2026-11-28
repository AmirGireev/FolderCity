# Measures how often the assistant finds the right file for the test questions of the demo repo.
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ..analysis import analyze
from ..scan.walker import scan_directory
from .embeddings import Embedder, default_embedder
from .limits import RateLimiter
from .llm import LLM, default_llm
from .service import AssistantService
from .store import MemoryStore

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"


@dataclass(frozen=True)
class QuestionResult:
    question: str
    expected: str
    found: list[str]
    hit: bool


def evaluate(
    embedder: Optional[Embedder], llm: Optional[LLM], eval_dir: Path = EVAL_DIR
) -> list[QuestionResult]:
    scan = scan_directory(eval_dir / "demo_repo", root_name="demo_repo")
    analysis = analyze(scan, with_findings=False)
    service = AssistantService(
        MemoryStore(), embedder, llm, RateLimiter([(10_000, 60)]), RateLimiter([(10_000, 60)])
    )
    indexed = service.index(scan.rootName, scan.files, analysis.symbols, analysis.architecture)
    questions = json.loads((eval_dir / "questions.json").read_text(encoding="utf-8"))
    results = []
    for entry in questions:
        answer = service.ask(indexed.repo_hash, entry["question"])
        files = list(dict.fromkeys(reference.file for reference in answer.references))
        results.append(QuestionResult(entry["question"], entry["file"], files, entry["file"] in files))
    return results


def main(argv: list[str]) -> int:
    use_ai = "--no-ai" not in argv
    embedder = default_embedder()
    llm = default_llm() if use_ai else None
    results = evaluate(embedder, llm)
    mode = "AI answers" if llm is not None else "plain search (no AI model)"
    print(f"Mode: {mode}; embeddings: {embedder.model_name if embedder else 'off'}")
    for result in results:
        mark = "OK  " if result.hit else "MISS"
        print(f"{mark} {result.question}\n     expected {result.expected}, got {', '.join(result.found) or '-'}")
    hits = sum(r.hit for r in results)
    print(f"\nHit rate: {hits}/{len(results)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

# Verified auto-fix: the AI proposes a patch, a temporary copy is checked, and only a patch that passes is shown.
from __future__ import annotations

import difflib
from collections import Counter
from dataclasses import dataclass
from typing import Optional

from tree_sitter import Node

from .ai.assistant import AssistantError
from .ai.fix_patch import CONTEXT_LINES, NoSafePatch, Patch, request_patch
from .ai.llm import LLM
from .analysis.findings import find_findings
from .analysis.parsing import JAVASCRIPT_FAMILY, language_of, parse
from .models import Finding

MAX_CONTENT_CHARS = 1_000_000
MAX_PATH_CHARS = 300


class FixInputError(AssistantError):
    status_code = 422


class FixNotConfigured(AssistantError):
    status_code = 503


@dataclass(frozen=True)
class FixResult:
    ok: bool
    reason: str
    start_line: int = 0
    end_line: int = 0
    replacement: str = ""
    explanation: str = ""
    diff: str = ""
    before: str = ""
    after: str = ""


def supports_fix(path: str) -> bool:
    language = language_of(path)
    return language == "python" or language in JAVASCRIPT_FAMILY


def count_syntax_errors(path: str, content: str) -> int:
    language = language_of(path)
    if language is None:
        return 0
    root, _ = parse(language, content)
    count = 0
    stack: list[Node] = [root]
    while stack:
        node = stack.pop()
        if node.type == "ERROR" or node.is_missing:
            count += 1
        stack.extend(node.children)
    return count


def _signature(findings: list[Finding]) -> Counter[tuple[str, str]]:
    return Counter((f.rule, f.message) for f in findings)


def verify_patch(path: str, before: str, after: str, target: Finding) -> Optional[str]:
    if after == before:
        return "The patch does not change anything."
    errors_before = count_syntax_errors(path, before)
    errors_after = count_syntax_errors(path, after)
    if errors_after > errors_before:
        return "The patched code has syntax errors."
    before_findings = _signature(find_findings({path: before}))
    after_findings = _signature(find_findings({path: after}))
    target_key = (target.rule, target.message)
    expected = before_findings.copy()
    expected[target_key] -= 1
    if after_findings[target_key] >= before_findings[target_key]:
        return "The finding is still there after the patch."
    new = after_findings - expected
    if new:
        rule = sorted(new)[0][0]
        return f"The patch causes a new finding ({rule})."
    return None


def make_diff(path: str, before: str, after: str) -> str:
    diff = difflib.unified_diff(
        before.splitlines(), after.splitlines(), fromfile=f"a/{path}", tofile=f"b/{path}", lineterm="", n=3
    )
    return "\n".join(diff)


def apply_patch(content: str, patch: Patch) -> str:
    lines = content.split("\n")
    replacement = patch.replacement.split("\n") if patch.replacement != "" else []
    return "\n".join(lines[: patch.start_line - 1] + replacement + lines[patch.end_line :])


def propose_fix(llm: Optional[LLM], path: str, content: str, rule: str, line: int) -> FixResult:
    if llm is None:
        raise FixNotConfigured("No AI model is set up on the server.")
    if not path or len(path) > MAX_PATH_CHARS or len(content) > MAX_CONTENT_CHARS:
        raise FixInputError("The file is missing or too large.")
    if not supports_fix(path):
        raise FixInputError("Auto-fix works for Python, JavaScript and TypeScript files.")
    content = content.removeprefix("﻿").replace("\r\n", "\n")

    findings = find_findings({path: content})
    target = next((f for f in findings if f.rule == rule and f.line == line), None)
    if target is None:
        raise FixInputError("That finding does not exist in this file (any more).")

    lines = content.split("\n")
    window_start = max(1, line - CONTEXT_LINES)
    window_end = min(len(lines), line + CONTEXT_LINES)
    window = lines[window_start - 1 : window_end]
    try:
        patch = request_patch(llm, path, target.rule, target.message, line, window_start, window)
    except NoSafePatch as err:
        return FixResult(False, err.message)

    patched = apply_patch(content, patch)
    problem = verify_patch(path, content, patched, target)
    if problem is not None:
        return FixResult(False, problem)
    return FixResult(
        ok=True,
        reason="",
        start_line=patch.start_line,
        end_line=patch.end_line,
        replacement=patch.replacement,
        explanation=patch.explanation,
        diff=make_diff(path, content, patched),
        before="\n".join(lines[patch.start_line - 1 : patch.end_line]),
        after=patch.replacement,
    )

# Finds lint and rule findings: Ruff for Python (run on a copy) plus own tree-sitter rules for Python, JavaScript and TypeScript.
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from ..models import Finding
from ..scan.model import ScanFile
from .parsing import language_of
from .rules_security import scan_rules

RUFF_SELECT = "E9,F,B,S"
RUFF_IGNORE = "S101,S311,S603,S607,B008"
RUFF_TIMEOUT_SECONDS = 40
MAX_MESSAGE_CHARS = 300

HIGH_RULES = frozenset({
    "S102", "S105", "S106", "S107", "S301", "S307", "S506", "S602", "S604", "S605", "S608", "S701",
    "F821", "F822", "F823", "F631", "F632", "F702", "F706", "invalid-syntax", "E902",
})  # fmt: skip
LOW_RULES = frozenset({"F401", "F841", "F811", "S113", "S324", "B007", "B905", "S110", "S112"})

COVERED_BY_RUFF = {"FC001": {"S105", "S106", "S107"}, "FC002": {"S102", "S307"}, "FC003": {"S608"}}


def severity_for(rule: str) -> str:
    if rule in HIGH_RULES:
        return "high"
    if rule in LOW_RULES:
        return "low"
    return "medium"


def _clean(message: str) -> str:
    return " ".join(message.split())[:MAX_MESSAGE_CHARS]


def run_ruff(python_files: dict[str, str]) -> list[Finding]:
    if not python_files:
        return []
    with tempfile.TemporaryDirectory(prefix="foldercity-ruff-") as folder:
        names: dict[str, str] = {}
        for index, (path, content) in enumerate(sorted(python_files.items())):
            name = f"f{index}.py"
            (Path(folder) / name).write_text(content, encoding="utf-8", newline="")
            names[name] = path
        command = [
            sys.executable, "-m", "ruff", "check", "--isolated", "--no-cache", "--output-format", "json",
            "--select", RUFF_SELECT, "--ignore", RUFF_IGNORE, ".",
        ]  # fmt: skip
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=RUFF_TIMEOUT_SECONDS, cwd=folder, shell=False, check=False)
            raw = json.loads(completed.stdout)
        except (OSError, subprocess.SubprocessError, ValueError):
            return []
    if not isinstance(raw, list):
        return []
    findings: list[Finding] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        path = names.get(Path(str(item.get("filename", ""))).name)
        location = item.get("location") or {}
        rule = item.get("code") or item.get("name")
        row = location.get("row") if isinstance(location, dict) else None
        if path is None or not rule or not isinstance(row, int) or row < 1:
            continue
        if rule == "F401" and path.rsplit("/", 1)[-1] == "__init__.py":
            continue
        findings.append(
            Finding(
                id=f"ruff:{rule}@{path}:{row}", fileId=path, line=row, rule=str(rule),
                message=_clean(str(item.get("message", ""))), severity=severity_for(str(rule)), source="ruff",  # type: ignore[arg-type]
            )
        )
    return findings


def find_findings(files: dict[str, str], use_ruff: bool = True) -> list[Finding]:
    python_files = {p: c for p, c in files.items() if language_of(p) == "python"}
    ruff = run_ruff(python_files) if use_ruff else []
    covered = {(f.fileId, f.line, f.rule) for f in ruff}
    found: dict[str, Finding] = {f.id: f for f in ruff}
    for path, content in sorted(files.items()):
        for hit in scan_rules(path, content):
            if any((path, hit.line, code) in covered for code in COVERED_BY_RUFF.get(hit.rule, ())):
                continue
            finding = Finding(
                id=f"rules:{hit.rule}@{path}:{hit.line}", fileId=path, line=hit.line, rule=hit.rule,
                message=_clean(hit.message), severity=hit.severity, source="rules",  # type: ignore[arg-type]
            )
            found.setdefault(finding.id, finding)
    return sorted(found.values(), key=lambda f: (f.fileId, f.line, f.rule, f.source))


def findings_for_scan(files: list[ScanFile]) -> list[Finding]:
    return find_findings({f.path: f.content for f in files if f.content is not None})

# Finds APIs, databases, external services and servers with small rules and returns architecture nodes.
from __future__ import annotations

from ...models import ArchitectureNode
from ...scan.model import ScanFile
from . import api, database, external, servers
from .rules import Finding, Rule

ALL_RULES: list[Rule] = [*api.RULES, *database.RULES, *external.RULES, *servers.RULES]


def findings_for_file(path: str, content: str) -> list[Finding]:
    found: dict[tuple[str, str], Finding] = {}
    for rule in ALL_RULES:
        if not rule.applies(path):
            continue
        for finding in rule.find(path, content):
            key = (finding.kind, finding.label)
            if key not in found or finding.line < found[key].line:
                found[key] = finding
    return sorted(found.values(), key=lambda f: (f.line, f.kind, f.label))


def detect_architecture(files: list[ScanFile]) -> list[ArchitectureNode]:
    nodes: list[ArchitectureNode] = []
    for file in sorted(files, key=lambda f: f.path):
        if file.content is None:
            continue
        for finding in findings_for_file(file.path, file.content):
            nodes.append(
                ArchitectureNode(
                    id=f"{finding.kind}:{finding.label}@{file.path}",
                    kind=finding.kind,
                    label=finding.label,
                    fileId=file.path,
                    line=finding.line,
                )
            )
    return nodes


__all__ = ["ALL_RULES", "detect_architecture", "findings_for_file"]

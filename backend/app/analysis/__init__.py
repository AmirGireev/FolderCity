# Deterministic code analysis: symbols, import graph, architecture, metrics and findings, never touching the AI layer.
from __future__ import annotations

from dataclasses import dataclass, field

from ..models import ArchitectureNode, Finding, ImportEdge, Symbol
from ..scan.model import ScanResult
from .architecture import detect_architecture
from .findings import findings_for_scan
from .graph import build_import_graph, graph_to_edges
from .metrics import add_complexity, blast_radius, file_complexity, find_cycles
from .parsing import language_of
from .symbols import extract_symbols


@dataclass(frozen=True)
class Analysis:
    symbols: list[Symbol]
    edges: list[ImportEdge]
    architecture: list[ArchitectureNode]
    findings: list[Finding] = field(default_factory=list)
    file_metrics: dict[str, dict[str, int]] = field(default_factory=dict)


def analyze(scan: ScanResult, with_findings: bool = True) -> Analysis:
    symbols: list[Symbol] = []
    for file in sorted(scan.files, key=lambda f: f.path):
        if file.content is not None and language_of(file.path) is not None:
            symbols.extend(extract_symbols(file.path, file.content))
    symbols = add_complexity(scan.files, symbols)

    graph = build_import_graph(scan.files)
    radius = blast_radius(graph)
    highest = file_complexity(symbols)
    metrics: dict[str, dict[str, int]] = {}
    for file in scan.files:
        if language_of(file.path) is None:
            continue
        entry = {"blastRadius": radius.get(file.path, 0)}
        if file.path in highest:
            entry["complexity"] = highest[file.path]
        metrics[file.path] = entry
    for number, cycle in enumerate(find_cycles(graph), start=1):
        for path in cycle:
            metrics.setdefault(path, {}).update({"cycle": number, "cycleSize": len(cycle)})

    return Analysis(
        symbols=symbols,
        edges=graph_to_edges(graph),
        architecture=detect_architecture(scan.files),
        findings=findings_for_scan(scan.files) if with_findings else [],
        file_metrics=metrics,
    )

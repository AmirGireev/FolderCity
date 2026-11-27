# Deterministic code analysis: symbols and the import graph, never touching the AI layer.
from __future__ import annotations

from dataclasses import dataclass

from ..models import ImportEdge, Symbol
from ..scan.model import ScanResult
from .graph import build_import_graph, graph_to_edges
from .parsing import language_of
from .symbols import extract_symbols


@dataclass(frozen=True)
class Analysis:
    symbols: list[Symbol]
    edges: list[ImportEdge]


def analyze(scan: ScanResult) -> Analysis:
    symbols: list[Symbol] = []
    for file in sorted(scan.files, key=lambda f: f.path):
        if file.content is not None and language_of(file.path) is not None:
            symbols.extend(extract_symbols(file.path, file.content))
    return Analysis(symbols=symbols, edges=graph_to_edges(build_import_graph(scan.files)))

# Builds the import graph (an edge A to B means A imports B) with NetworkX.
from __future__ import annotations

import networkx as nx

from ..models import ImportEdge
from ..scan.model import ScanFile
from .import_refs import extract_import_refs
from .parsing import language_of
from .resolve import Resolver


def build_import_graph(files: list[ScanFile]) -> nx.DiGraph:
    graph: nx.DiGraph = nx.DiGraph()
    resolver = Resolver(f.path for f in files)
    for file in files:
        graph.add_node(file.path)
    for file in sorted(files, key=lambda f: f.path):
        if file.content is None or language_of(file.path) is None:
            continue
        for ref in extract_import_refs(file.path, file.content):
            for target in resolver.resolve(file.path, ref):
                if not graph.has_edge(file.path, target):
                    graph.add_edge(file.path, target, line=ref.line)
    return graph


def graph_to_edges(graph: nx.DiGraph) -> list[ImportEdge]:
    return [
        ImportEdge(source=source, target=target, line=data.get("line"))
        for source, target, data in sorted(graph.edges(data=True), key=lambda e: (e[0], e[2].get("line") or 0, e[1]))
    ]

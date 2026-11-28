# Computes cyclomatic complexity per function, circular imports and the blast radius of each file.
from __future__ import annotations

import networkx as nx
from tree_sitter import Node

from ..models import Symbol
from ..scan.model import ScanFile
from .parsing import language_of, parse

BRANCH_TYPES: dict[str, frozenset[str]] = {
    "python": frozenset({
        "if_statement", "elif_clause", "for_statement", "while_statement", "except_clause",
        "conditional_expression", "case_clause", "for_in_clause", "if_clause",
    }),  # fmt: skip
    "javascript": frozenset({
        "if_statement", "for_statement", "for_in_statement", "while_statement", "do_statement",
        "switch_case", "catch_clause", "ternary_expression",
    }),  # fmt: skip
    "csharp": frozenset({
        "if_statement", "for_statement", "foreach_statement", "while_statement", "do_statement",
        "switch_section", "catch_clause", "conditional_expression",
    }),  # fmt: skip
    "java": frozenset({
        "if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement",
        "switch_block_statement_group", "switch_rule", "catch_clause", "ternary_expression",
    }),  # fmt: skip
    "c": frozenset({
        "if_statement", "for_statement", "while_statement", "do_statement", "case_statement", "conditional_expression",
    }),  # fmt: skip
    "cpp": frozenset({
        "if_statement", "for_statement", "for_range_loop", "while_statement", "do_statement", "case_statement",
        "catch_clause", "conditional_expression",
    }),  # fmt: skip
}
BRANCH_TYPES["typescript"] = BRANCH_TYPES["javascript"]
BRANCH_TYPES["tsx"] = BRANCH_TYPES["javascript"]

LOGICAL_OPERATOR_NODES = {
    "python": ("boolean_operator", {"and", "or"}),
    "javascript": ("binary_expression", {"&&", "||", "??"}),
    "typescript": ("binary_expression", {"&&", "||", "??"}),
    "tsx": ("binary_expression", {"&&", "||", "??"}),
    "csharp": ("binary_expression", {"&&", "||", "??"}),
    "java": ("binary_expression", {"&&", "||"}),
    "c": ("binary_expression", {"&&", "||"}),
    "cpp": ("binary_expression", {"&&", "||"}),
}


CASE_TYPES = frozenset({"switch_section", "switch_block_statement_group", "switch_rule", "case_statement", "case_clause"})


def _is_default_case(node: Node, source: bytes) -> bool:
    text = source[node.start_byte : node.end_byte].decode("utf-8", errors="replace").lstrip()
    return text.startswith("default") or text.startswith("case _:") or text.startswith("case _ ")


def decision_lines(path: str, content: str) -> list[int]:
    language = language_of(path)
    if language is None or language not in BRANCH_TYPES:
        return []
    root, source = parse(language, content)
    branch_types = BRANCH_TYPES[language]
    logical_type, logical_operators = LOGICAL_OPERATOR_NODES[language]
    lines: list[int] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type in branch_types:
            if node.type not in CASE_TYPES or not _is_default_case(node, source):
                lines.append(node.start_point[0] + 1)
        elif node.type == logical_type and _operator(node, source) in logical_operators:
            lines.append(node.start_point[0] + 1)
        stack.extend(node.children)
    return sorted(lines)


def _operator(node: Node, source: bytes) -> str:
    operator = node.child_by_field_name("operator")
    if operator is not None:
        return source[operator.start_byte : operator.end_byte].decode("utf-8", errors="replace")
    for child in node.children:
        if not child.is_named:
            return source[child.start_byte : child.end_byte].decode("utf-8", errors="replace")
    return ""


def add_complexity(files: list[ScanFile], symbols: list[Symbol]) -> list[Symbol]:
    by_file: dict[str, list[Symbol]] = {}
    for symbol in symbols:
        by_file.setdefault(symbol.fileId, []).append(symbol)
    contents = {f.path: f.content for f in files if f.content is not None}

    complexity: dict[str, int] = {}
    for path, file_symbols in by_file.items():
        functions = [s for s in file_symbols if s.kind != "class"]
        if not functions or path not in contents:
            continue
        counts = {s.id: 1 for s in functions}
        for line in decision_lines(path, contents[path]):
            owners = [s for s in functions if s.startLine <= line <= s.endLine]
            if owners:
                owner = min(owners, key=lambda s: (s.endLine - s.startLine, s.startLine))
                counts[owner.id] += 1
        complexity.update(counts)
    return [s.model_copy(update={"complexity": complexity[s.id]}) if s.id in complexity else s for s in symbols]


def file_complexity(symbols: list[Symbol]) -> dict[str, int]:
    highest: dict[str, int] = {}
    for symbol in symbols:
        if symbol.complexity is not None:
            highest[symbol.fileId] = max(highest.get(symbol.fileId, 0), symbol.complexity)
    return highest


def find_cycles(graph: nx.DiGraph) -> list[list[str]]:
    cycles = [sorted(component) for component in nx.strongly_connected_components(graph) if len(component) > 1]
    return sorted(cycles, key=lambda component: component[0])


def blast_radius(graph: nx.DiGraph) -> dict[str, int]:
    return {node: len(nx.ancestors(graph, node)) for node in graph.nodes}

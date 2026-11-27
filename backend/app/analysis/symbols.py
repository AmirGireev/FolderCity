# Extracts functions, classes and methods with line ranges from one file.
from __future__ import annotations

from typing import Optional

from tree_sitter import Node

from ..models import Symbol
from .parsing import JAVASCRIPT_FAMILY, language_of, lines_of, parse, text_of
from .symbols_generic import generic_symbols

MAX_DEPTH = 200
JS_CLASS_TYPES = {"class_declaration", "abstract_class_declaration", "class"}
JS_FUNCTION_VALUES = {"arrow_function", "function_expression", "function", "generator_function"}


def _symbol(file_id: str, kind: str, name: str, outer: Node) -> Symbol:
    start, end = lines_of(outer)
    return Symbol(id=f"{file_id}#{name}@{start}", fileId=file_id, kind=kind, name=name, startLine=start, endLine=end)  # type: ignore[arg-type]


def _name(node: Node, source: bytes) -> Optional[str]:
    name_node = node.child_by_field_name("name")
    return text_of(name_node, source) if name_node is not None else None


def _python_symbols(root: Node, source: bytes, file_id: str) -> list[Symbol]:
    found: list[Symbol] = []

    def visit(node: Node, outer: Node, owner: Optional[str], depth: int) -> None:
        if depth > MAX_DEPTH:
            return
        if node.type == "decorated_definition":
            inner = node.child_by_field_name("definition")
            if inner is not None:
                visit(inner, node, owner, depth + 1)
            return
        if node.type == "function_definition":
            name = _name(node, source)
            if name:
                found.append(_symbol(file_id, "method" if owner else "function", f"{owner}.{name}" if owner else name, outer))
            return
        if node.type == "class_definition":
            name = _name(node, source)
            if not name:
                return
            qualified = f"{owner}.{name}" if owner else name
            found.append(_symbol(file_id, "class", qualified, outer))
            body = node.child_by_field_name("body")
            if body is not None:
                for child in body.children:
                    visit(child, child, qualified, depth + 1)
            return
        for child in node.children:
            visit(child, child, owner, depth + 1)

    visit(root, root, None, 0)
    return found


def _javascript_symbols(root: Node, source: bytes, file_id: str) -> list[Symbol]:
    found: list[Symbol] = []

    def visit(node: Node, outer: Node, owner: Optional[str], depth: int) -> None:
        if depth > MAX_DEPTH:
            return
        kind = node.type
        if kind == "export_statement":
            for child in node.children:
                visit(child, node, owner, depth + 1)
            return
        if kind in ("function_declaration", "generator_function_declaration"):
            name = _name(node, source)
            if name:
                found.append(_symbol(file_id, "function", name, outer))
            return
        if kind in JS_CLASS_TYPES:
            name = _name(node, source)
            if not name:
                return
            found.append(_symbol(file_id, "class", name, outer))
            body = node.child_by_field_name("body")
            if body is not None:
                for child in body.children:
                    if child.type == "method_definition":
                        method = _name(child, source)
                        if method:
                            found.append(_symbol(file_id, "method", f"{name}.{method}", child))
            return
        if kind in ("lexical_declaration", "variable_declaration"):
            for declarator in node.children:
                if declarator.type != "variable_declarator":
                    continue
                value = declarator.child_by_field_name("value")
                name_node = declarator.child_by_field_name("name")
                if value is None or name_node is None or name_node.type != "identifier":
                    continue
                if value.type in JS_FUNCTION_VALUES:
                    found.append(_symbol(file_id, "function", text_of(name_node, source), outer))
                elif value.type in JS_CLASS_TYPES:
                    found.append(_symbol(file_id, "class", text_of(name_node, source), outer))
            return
        if kind in ("program", "statement_block", "namespace_declaration", "internal_module", "module", "ambient_declaration"):
            for child in node.children:
                visit(child, child, owner, depth + 1)

    visit(root, root, None, 0)
    return found


def extract_symbols(path: str, content: str) -> list[Symbol]:
    language = language_of(path)
    if language is None:
        return []
    root, source = parse(language, content)
    if language == "python":
        symbols = _python_symbols(root, source, path)
    elif language in JAVASCRIPT_FAMILY:
        symbols = _javascript_symbols(root, source, path)
    else:
        symbols = generic_symbols(language, root, source, path)
    return sorted(symbols, key=lambda s: (s.startLine, s.endLine, s.name))

# Finds classes, functions and methods in C#, Java, C and C++ with one rule table per language.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from tree_sitter import Node

from ..models import Symbol
from .parsing import lines_of, text_of

MAX_DEPTH = 200

NameFn = Callable[[Node, bytes], Optional[str]]
FunctionFn = Callable[[Node, bytes, Optional[str]], Optional[tuple[str, str]]]


@dataclass(frozen=True)
class Spec:
    classes: frozenset[str]
    functions: frozenset[str]
    transparent: frozenset[str]
    class_name: NameFn
    function_info: FunctionFn
    owners: frozenset[str] = field(default_factory=frozenset)
    owner_name: NameFn = lambda node, source: None


def _field_text(node: Node, source: bytes, field_name: str = "name") -> Optional[str]:
    child = node.child_by_field_name(field_name)
    return text_of(child, source) if child is not None else None


def _plain_function(node: Node, source: bytes, owner: Optional[str]) -> Optional[tuple[str, str]]:
    name = _field_text(node, source)
    if not name:
        return None
    return ("method", f"{owner}.{name}") if owner else ("function", name)


DECLARATOR_NAMES = {
    "identifier", "field_identifier", "qualified_identifier", "destructor_name", "operator_name", "type_identifier",
}  # fmt: skip


def _declarator_name(node: Node, source: bytes) -> Optional[str]:
    current = node.child_by_field_name("declarator")
    for _ in range(20):
        if current is None:
            return None
        if current.type in DECLARATOR_NAMES:
            return text_of(current, source)
        following = current.child_by_field_name("declarator")
        current = following if following is not None else next(iter(current.named_children), None)
    return None


def _c_function(node: Node, source: bytes, owner: Optional[str]) -> Optional[tuple[str, str]]:
    name = _declarator_name(node, source)
    if not name:
        return None
    if "::" in name:
        return "method", name.replace("::", ".")
    return ("method", f"{owner}.{name}") if owner else ("function", name)


def _body_class_name(node: Node, source: bytes) -> Optional[str]:
    if node.child_by_field_name("body") is None:
        return None
    return _field_text(node, source)


def _name(node: Node, source: bytes) -> Optional[str]:
    return _field_text(node, source)


SPECS: dict[str, Spec] = {
    "csharp": Spec(
        classes=frozenset({
            "class_declaration", "struct_declaration", "interface_declaration", "enum_declaration",
            "record_declaration", "record_struct_declaration",
        }),  # fmt: skip
        functions=frozenset({"method_declaration", "constructor_declaration", "destructor_declaration"}),
        transparent=frozenset({
            "compilation_unit", "namespace_declaration", "file_scoped_namespace_declaration", "declaration_list",
        }),  # fmt: skip
        class_name=_name,
        function_info=_plain_function,
    ),
    "java": Spec(
        classes=frozenset({
            "class_declaration", "interface_declaration", "enum_declaration", "record_declaration",
            "annotation_type_declaration",
        }),  # fmt: skip
        functions=frozenset({"method_declaration", "constructor_declaration"}),
        transparent=frozenset({
            "program", "class_body", "interface_body", "enum_body", "enum_body_declarations", "annotation_type_body",
        }),  # fmt: skip
        class_name=_name,
        function_info=_plain_function,
    ),
    "c": Spec(
        classes=frozenset({"struct_specifier", "union_specifier"}),
        functions=frozenset({"function_definition"}),
        transparent=frozenset({
            "translation_unit", "linkage_specification", "declaration_list", "preproc_if", "preproc_ifdef",
            "preproc_else", "preproc_elif",
        }),  # fmt: skip
        class_name=_body_class_name,
        function_info=_c_function,
    ),
    "cpp": Spec(
        classes=frozenset({"class_specifier", "struct_specifier", "union_specifier"}),
        functions=frozenset({"function_definition"}),
        transparent=frozenset({
            "translation_unit", "namespace_definition", "declaration_list", "template_declaration",
            "linkage_specification", "field_declaration_list", "preproc_if", "preproc_ifdef", "preproc_else",
            "preproc_elif",
        }),  # fmt: skip
        class_name=_body_class_name,
        function_info=_c_function,
    ),
}


def _symbol(file_id: str, kind: str, name: str, node: Node) -> Symbol:
    start, end = lines_of(node)
    return Symbol(id=f"{file_id}#{name}@{start}", fileId=file_id, kind=kind, name=name, startLine=start, endLine=end)  # type: ignore[arg-type]


def generic_symbols(language: str, root: Node, source: bytes, file_id: str) -> list[Symbol]:
    spec = SPECS[language]
    found: list[Symbol] = []

    def visit(node: Node, owner: Optional[str], depth: int) -> None:
        if depth > MAX_DEPTH:
            return
        kind = node.type
        if kind in spec.classes:
            name = spec.class_name(node, source)
            if not name:
                return
            qualified = f"{owner}.{name}" if owner else name
            found.append(_symbol(file_id, "class", qualified, node))
            for child in node.children:
                visit(child, qualified, depth + 1)
        elif kind in spec.owners:
            name = spec.owner_name(node, source)
            for child in node.children:
                visit(child, name, depth + 1)
        elif kind in spec.functions:
            info = spec.function_info(node, source, owner)
            if info:
                found.append(_symbol(file_id, info[0], info[1], node))
        elif kind in spec.transparent:
            for child in node.children:
                visit(child, owner, depth + 1)

    visit(root, None, 0)
    return found

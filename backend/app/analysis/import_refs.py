# Finds import statements and declared namespaces in one file and returns raw names with line numbers.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from tree_sitter import Node

from .parsing import JAVASCRIPT_FAMILY, language_of, parse, text_of


@dataclass(frozen=True)
class ImportRef:
    module: str
    line: int
    level: int = 0
    names: tuple[str, ...] = field(default_factory=tuple)
    kind: str = ""


def _line(node: Node) -> int:
    return node.start_point[0] + 1


def _walk(root: Node, visit: Callable[[Node], bool]) -> None:
    stack = [root]
    while stack:
        node = stack.pop()
        if visit(node):
            stack.extend(reversed(node.children))


def _string_content(node: Optional[Node], source: bytes) -> Optional[str]:
    if node is None:
        return None
    parts = [text_of(c, source) for c in node.children if c.type in ("string_content", "string_fragment", "interpreted_string_literal_content")]
    if parts:
        return "".join(parts)
    text = text_of(node, source)
    return text[1:-1] if len(text) >= 2 and text[0] in "\"'`<" else None


def _first_string(node: Node, source: bytes) -> Optional[str]:
    stack = [node]
    while stack:
        current = stack.pop()
        if current.type in ("string", "encapsed_string", "string_literal", "interpreted_string_literal", "raw_string_literal"):
            return _string_content(current, source)
        stack.extend(reversed(current.children))
    return None


def _python_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []

    def visit(node: Node) -> bool:
        line = _line(node)
        if node.type == "import_statement":
            for child in node.children:
                target = child.child_by_field_name("name") if child.type == "aliased_import" else child
                if target is not None and target.type == "dotted_name":
                    refs.append(ImportRef(module=text_of(target, source), line=line))
            return False
        if node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            if module_node is not None:
                raw = text_of(module_node, source)
                module = raw.lstrip(".")
                names = []
                for child in node.children_by_field_name("name"):
                    target = child.child_by_field_name("name") if child.type == "aliased_import" else child
                    if target is not None:
                        names.append(text_of(target, source))
                refs.append(ImportRef(module=module, line=line, level=len(raw) - len(module), names=tuple(names)))
            return False
        return True

    _walk(root, visit)
    return refs


def _javascript_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []

    def visit(node: Node) -> bool:
        line = _line(node)
        if node.type in ("import_statement", "export_statement"):
            source_node = node.child_by_field_name("source")
            value = _string_content(source_node, source) if source_node is not None and source_node.type == "string" else None
            if value:
                refs.append(ImportRef(module=value, line=line))
        elif node.type == "call_expression":
            function = node.child_by_field_name("function")
            arguments = node.child_by_field_name("arguments")
            if function is not None and arguments is not None and function.type in ("identifier", "import"):
                if text_of(function, source) in ("require", "import"):
                    first = next((c for c in arguments.children if c.is_named), None)
                    value = _string_content(first, source) if first is not None and first.type == "string" else None
                    if value:
                        refs.append(ImportRef(module=value, line=line))
        return True

    _walk(root, visit)
    return refs


def _csharp_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []

    def visit(node: Node) -> bool:
        if node.type == "using_directive":
            target = next((c for c in reversed(node.named_children) if c.type in ("qualified_name", "identifier", "alias_qualified_name")), None)
            if target is not None:
                refs.append(ImportRef(module=text_of(target, source), line=_line(node), kind="using"))
            return False
        return node.type in ("compilation_unit", "namespace_declaration", "file_scoped_namespace_declaration", "declaration_list")

    _walk(root, visit)
    return refs


def _java_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []
    for node in root.children:
        if node.type != "import_declaration":
            continue
        target = next((c for c in node.named_children if c.type in ("scoped_identifier", "identifier")), None)
        if target is None:
            continue
        wildcard = any(c.type == "asterisk" for c in node.named_children)
        is_static = any(c.type == "static" for c in node.children)
        refs.append(
            ImportRef(
                module=text_of(target, source), line=_line(node),
                names=("*",) if wildcard else (), kind="static" if is_static else "",
            )  # fmt: skip
        )
    return refs


def _c_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []

    def visit(node: Node) -> bool:
        if node.type == "preproc_include":
            path = node.child_by_field_name("path")
            value = _string_content(path, source) if path is not None else None
            if value:
                refs.append(ImportRef(module=value, line=_line(node), kind="system" if path.type == "system_lib_string" else "local"))
            return False
        return node.type in ("translation_unit", "preproc_if", "preproc_ifdef", "preproc_else", "preproc_elif", "linkage_specification", "namespace_definition", "declaration_list")

    _walk(root, visit)
    return refs


def extract_import_refs(path: str, content: str) -> list[ImportRef]:
    language = language_of(path)
    if language is None:
        return []
    root, source = parse(language, content)
    if language == "python":
        refs = _python_refs(root, source)
    elif language in JAVASCRIPT_FAMILY:
        refs = _javascript_refs(root, source)
    elif language == "csharp":
        refs = _csharp_refs(root, source)
    elif language == "java":
        refs = _java_refs(root, source)
    elif language in ("c", "cpp"):
        refs = _c_refs(root, source)
    else:
        refs = []
    return sorted(refs, key=lambda r: r.line)


def extract_namespaces(path: str, content: str) -> list[str]:
    language = language_of(path)
    if language not in ("csharp", "java"):
        return []
    root, source = parse(language, content)
    found: list[str] = []

    def walk(node: Node, prefix: str, depth: int) -> None:
        if depth > 30:
            return
        for child in node.children:
            if language == "csharp" and child.type in ("namespace_declaration", "file_scoped_namespace_declaration"):
                name = child.child_by_field_name("name")
                full = prefix + (text_of(name, source) if name is not None else "")
                if name is not None:
                    found.append(full)
                body = child.child_by_field_name("body")
                walk(body if body is not None else child, full + ".", depth + 1)
            elif language == "java" and child.type == "package_declaration":
                target = next((c for c in child.named_children if c.type in ("scoped_identifier", "identifier")), None)
                if target is not None:
                    found.append(text_of(target, source))
            elif child.type in ("declaration_list", "compilation_unit"):
                walk(child, prefix, depth + 1)

    walk(root, "", 0)
    return list(dict.fromkeys(found))

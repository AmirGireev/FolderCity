# Finds import statements in one file and returns the raw module names with line numbers.
from __future__ import annotations

from dataclasses import dataclass, field

from tree_sitter import Node

from .parsing import language_of, parse, text_of


@dataclass(frozen=True)
class ImportRef:
    module: str
    line: int
    level: int = 0
    names: tuple[str, ...] = field(default_factory=tuple)


def _python_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []
    stack = [root]
    while stack:
        node = stack.pop()
        line = node.start_point[0] + 1
        if node.type == "import_statement":
            for child in node.children:
                target = child.child_by_field_name("name") if child.type == "aliased_import" else child
                if target is not None and target.type == "dotted_name":
                    refs.append(ImportRef(module=text_of(target, source), line=line))
        elif node.type == "import_from_statement":
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
        else:
            stack.extend(reversed(node.children))
    return sorted(refs, key=lambda r: r.line)


def _string_value(node: Node, source: bytes) -> str | None:
    if node.type != "string":
        return None
    text = text_of(node, source)
    return text[1:-1] if len(text) >= 2 else None


def _javascript_refs(root: Node, source: bytes) -> list[ImportRef]:
    refs: list[ImportRef] = []
    stack = [root]
    while stack:
        node = stack.pop()
        line = node.start_point[0] + 1
        if node.type in ("import_statement", "export_statement"):
            source_node = node.child_by_field_name("source")
            value = _string_value(source_node, source) if source_node is not None else None
            if value:
                refs.append(ImportRef(module=value, line=line))
        elif node.type == "call_expression":
            function = node.child_by_field_name("function")
            arguments = node.child_by_field_name("arguments")
            if function is not None and arguments is not None and function.type in ("identifier", "import"):
                if text_of(function, source) in ("require", "import"):
                    first = next((c for c in arguments.children if c.is_named), None)
                    value = _string_value(first, source) if first is not None else None
                    if value:
                        refs.append(ImportRef(module=value, line=line))
        stack.extend(reversed(node.children))
    return sorted(refs, key=lambda r: r.line)


def extract_import_refs(path: str, content: str) -> list[ImportRef]:
    language = language_of(path)
    if language is None:
        return []
    root, source = parse(language, content)
    return _python_refs(root, source) if language == "python" else _javascript_refs(root, source)

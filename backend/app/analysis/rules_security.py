# Own simple rules with tree-sitter: hard-coded secrets, eval/exec and SQL built from strings (Python, JavaScript, TypeScript).
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from tree_sitter import Node

from .parsing import JAVASCRIPT_FAMILY, language_of, parse, text_of

SECRET_NAME = re.compile(
    r"(pass(word|wd)?|pwd|secret|api[_-]?key|apikey|token|private[_-]?key|access[_-]?key|credential|auth[_-]?key)",
    re.IGNORECASE,
)
NOT_A_SECRET = re.compile(
    r"(url|uri|path|file|name|field|type|header|prefix|endpoint|expires|length|count|id|label|hint|regex|pattern)$",
    re.IGNORECASE,
)
PLACEHOLDER = re.compile(r"(example|your[_ -]|xxx|changeme|change_me|placeholder|todo|dummy|<.*>|\$\{|\{\{|%s|\*\*\*)", re.IGNORECASE)
TOKEN_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    re.compile(r"sk_live_[0-9A-Za-z]{16,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"),
]
SQL_TEXT = re.compile(
    r"\b(select\b.*\bfrom|insert\s+into|update\b.*\bset|delete\s+from|drop\s+(table|database)|alter\s+table)\b",
    re.IGNORECASE | re.DOTALL,
)
SQL_CALLS = frozenset({"execute", "executemany", "executescript", "query", "raw", "exec", "queryRaw", "executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"})
MIN_SECRET_LENGTH = 6


@dataclass(frozen=True)
class RuleHit:
    rule: str
    line: int
    message: str
    severity: str


def is_test_path(path: str) -> bool:
    lowered = path.lower()
    name = lowered.rsplit("/", 1)[-1]
    return "/test" in "/" + lowered or name.startswith("test_") or ".test." in name or ".spec." in name or "__tests__" in lowered


def _line(node: Node) -> int:
    return node.start_point[0] + 1


def _string_parts(node: Node, source: bytes, language: str) -> Optional[tuple[str, bool]]:
    if language == "python":
        if node.type != "string":
            return None
        has_interpolation = any(c.type == "interpolation" for c in node.children)
        return "".join(text_of(c, source) for c in node.children if c.type == "string_content"), has_interpolation
    if node.type == "string":
        return "".join(text_of(c, source) for c in node.children if c.type == "string_fragment"), False
    if node.type == "template_string":
        has_substitution = any(c.type == "template_substitution" for c in node.children)
        return "".join(text_of(c, source) for c in node.children if c.type == "string_fragment"), has_substitution
    return None


def _target_name(node: Optional[Node], source: bytes, language: str) -> Optional[str]:
    if node is None:
        return None
    if node.type in ("identifier", "property_identifier", "shorthand_property_identifier"):
        return text_of(node, source)
    if node.type == "attribute":
        attribute = node.child_by_field_name("attribute")
        return text_of(attribute, source) if attribute is not None else None
    if node.type == "member_expression":
        prop = node.child_by_field_name("property")
        return text_of(prop, source) if prop is not None else None
    parts = _string_parts(node, source, language)
    return parts[0] if parts is not None and not parts[1] else None


def _looks_secret(name: str, value: str) -> bool:
    if not SECRET_NAME.search(name) or NOT_A_SECRET.search(name):
        return False
    stripped = value.strip()
    return len(stripped) >= MIN_SECRET_LENGTH and not PLACEHOLDER.search(stripped)


def _secret_hits(node: Node, source: bytes, language: str, severity: str) -> list[RuleHit]:
    pairs: list[tuple[Optional[Node], Optional[Node]]] = []
    if node.type == "assignment" and language == "python":
        pairs.append((node.child_by_field_name("left"), node.child_by_field_name("right")))
    elif node.type == "keyword_argument":
        pairs.append((node.child_by_field_name("name"), node.child_by_field_name("value")))
    elif node.type == "pair":
        pairs.append((node.child_by_field_name("key"), node.child_by_field_name("value")))
    elif node.type == "variable_declarator":
        pairs.append((node.child_by_field_name("name"), node.child_by_field_name("value")))
    elif node.type == "assignment_expression":
        pairs.append((node.child_by_field_name("left"), node.child_by_field_name("right")))
    hits = []
    for target, value in pairs:
        name = _target_name(target, source, language)
        parts = _string_parts(value, source, language) if value is not None else None
        if name and parts is not None and not parts[1] and _looks_secret(name, parts[0]):
            hits.append(
                RuleHit("FC001", _line(node), f"A value for '{name}' is written directly in the code. Use an environment variable or a secret store.", severity)
            )
    return hits


def _token_hit(node: Node, source: bytes, language: str) -> Optional[RuleHit]:
    parts = _string_parts(node, source, language)
    if parts is None or parts[1]:
        return None
    if any(pattern.search(parts[0]) for pattern in TOKEN_PATTERNS):
        return RuleHit("FC001", _line(node), "A text that looks like an API key or private key is written directly in the code.", "high")
    return None


def _call_name(node: Node, source: bytes) -> Optional[str]:
    function = node.child_by_field_name("function")
    if function is None:
        return None
    if function.type == "identifier":
        return text_of(function, source)
    if function.type == "attribute":
        attribute = function.child_by_field_name("attribute")
        return text_of(attribute, source) if attribute is not None else None
    if function.type == "member_expression":
        prop = function.child_by_field_name("property")
        return text_of(prop, source) if prop is not None else None
    return None


def _first_argument(node: Node) -> Optional[Node]:
    arguments = node.child_by_field_name("arguments")
    if arguments is None:
        return None
    return next((c for c in arguments.named_children if c.type != "comment"), None)


def _leaves(node: Node, source: bytes) -> list[Node]:
    if node.type in ("binary_operator", "binary_expression"):
        operator = node.child_by_field_name("operator")
        if operator is not None and text_of(operator, source) in ("+", "%"):
            left, right = node.child_by_field_name("left"), node.child_by_field_name("right")
            return (_leaves(left, source) if left else []) + (_leaves(right, source) if right else [])
    if node.type == "parenthesized_expression":
        inner = next(iter(node.named_children), None)
        return _leaves(inner, source) if inner is not None else [node]
    return [node]


def _is_dynamic_sql(argument: Node, source: bytes, language: str) -> bool:
    parts = _string_parts(argument, source, language)
    if parts is not None:
        return parts[1] and SQL_TEXT.search(parts[0]) is not None
    if argument.type == "call" and language == "python":
        function = argument.child_by_field_name("function")
        if function is not None and function.type == "attribute":
            attribute, owner = function.child_by_field_name("attribute"), function.child_by_field_name("object")
            if attribute is not None and text_of(attribute, source) == "format" and owner is not None:
                owner_parts = _string_parts(owner, source, language)
                return owner_parts is not None and SQL_TEXT.search(owner_parts[0]) is not None
        return False
    leaves = _leaves(argument, source)
    if len(leaves) < 2:
        return False
    literal_with_sql = False
    dynamic = False
    for leaf in leaves:
        leaf_parts = _string_parts(leaf, source, language)
        if leaf_parts is None:
            dynamic = True
        elif SQL_TEXT.search(leaf_parts[0]) or leaf_parts[1]:
            literal_with_sql = literal_with_sql or SQL_TEXT.search(leaf_parts[0]) is not None
            dynamic = dynamic or leaf_parts[1]
    return literal_with_sql and dynamic


def _call_hits(node: Node, source: bytes, language: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    name = _call_name(node, source)
    argument = _first_argument(node)
    function = node.child_by_field_name("function")
    is_plain = function is not None and function.type == "identifier"
    if name in ("eval", "exec") and is_plain and (language == "python" or name == "eval"):
        parts = _string_parts(argument, source, language) if argument is not None else None
        literal = parts is not None and not parts[1]
        hits.append(
            RuleHit("FC002", _line(node), f"{name}() runs text as code. Avoid it, or limit the input strictly.", "medium" if literal else "high")
        )
    elif language != "python" and name == "Function" and is_plain:
        hits.append(RuleHit("FC002", _line(node), "Function() builds code from text. Avoid it.", "high"))
    elif language != "python" and name in ("setTimeout", "setInterval") and is_plain and argument is not None:
        parts = _string_parts(argument, source, language)
        if parts is not None:
            hits.append(RuleHit("FC002", _line(node), f"{name}() with a string runs that text as code. Pass a function instead.", "medium"))
    if name in SQL_CALLS and argument is not None and _is_dynamic_sql(argument, source, language):
        hits.append(RuleHit("FC003", _line(node), "SQL text is built from strings. Use query parameters instead.", "high"))
    return hits


def scan_rules(path: str, content: str) -> list[RuleHit]:
    language = language_of(path)
    if language != "python" and language not in JAVASCRIPT_FAMILY:
        return []
    root, source = parse(language, content)
    secret_severity = "low" if is_test_path(path) else "high"
    hits: list[RuleHit] = []
    stack = [root]
    while stack:
        node = stack.pop()
        hits += _secret_hits(node, source, language, secret_severity)
        token = _token_hit(node, source, language)
        if token is not None:
            hits.append(token)
        if node.type in ("call", "call_expression"):
            hits += _call_hits(node, source, language)
        elif node.type == "new_expression":
            constructor = node.child_by_field_name("constructor")
            if constructor is not None and text_of(constructor, source) == "Function" and language != "python":
                hits.append(RuleHit("FC002", _line(node), "Function() builds code from text. Avoid it.", "high"))
        stack.extend(node.children)
    unique = {(hit.rule, hit.line, hit.message): hit for hit in hits}
    return sorted(unique.values(), key=lambda hit: (hit.line, hit.rule, hit.message))

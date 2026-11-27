# Creates tree-sitter parsers and maps file names to supported languages.
from __future__ import annotations

from functools import lru_cache
from typing import Optional

import tree_sitter_c
import tree_sitter_c_sharp
import tree_sitter_cpp
import tree_sitter_java
import tree_sitter_javascript
import tree_sitter_python
import tree_sitter_typescript
from tree_sitter import Language, Node, Parser

LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
    ".cs": "csharp",
    ".java": "java",
    ".c": "c",
    ".h": "cpp",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".c++": "cpp",
    ".hh": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
}

JAVASCRIPT_FAMILY = ("javascript", "typescript", "tsx")


def language_of(path: str) -> Optional[str]:
    name = path.rsplit("/", 1)[-1]
    dot = name.rfind(".")
    return LANGUAGE_BY_EXTENSION.get(name[dot:].lower()) if dot > 0 else None


@lru_cache(maxsize=None)
def _parser(language: str) -> Parser:
    grammars = {
        "python": tree_sitter_python.language,
        "javascript": tree_sitter_javascript.language,
        "typescript": tree_sitter_typescript.language_typescript,
        "tsx": tree_sitter_typescript.language_tsx,
        "csharp": tree_sitter_c_sharp.language,
        "java": tree_sitter_java.language,
        "c": tree_sitter_c.language,
        "cpp": tree_sitter_cpp.language,
    }
    return Parser(Language(grammars[language]()))


def parse(language: str, content: str) -> tuple[Node, bytes]:
    source = content.removeprefix("﻿").encode("utf-8")
    return _parser(language).parse(source).root_node, source


def text_of(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def lines_of(node: Node) -> tuple[int, int]:
    return node.start_point[0] + 1, node.end_point[0] + 1

# Shared types and helpers for the architecture detection rules (one small rule per pattern).
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ...models.city_model import ArchitectureKind


@dataclass(frozen=True)
class Finding:
    kind: ArchitectureKind
    label: str
    line: int


@dataclass(frozen=True)
class Rule:
    name: str
    applies: Callable[[str], bool]
    find: Callable[[str, str], list[Finding]]


def line_of(content: str, index: int) -> int:
    return content.count("\n", 0, index) + 1


def basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def extension_in(*extensions: str) -> Callable[[str], bool]:
    return lambda path: basename(path).lower().endswith(extensions)


PYTHON = extension_in(".py")
JAVASCRIPT = extension_in(".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts")
CODE = extension_in(
    ".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".java", ".cs", ".c", ".cc", ".cpp", ".h", ".hpp"
)  # fmt: skip

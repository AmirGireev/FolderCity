# Cuts the code of a repo into chunks (one per function or class) and computes the repo hash.
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Optional

from ..models import Symbol
from ..scan.model import ScanFile

MAX_FUNCTION_LINES = 80
MAX_CLASS_LINES = 30
HEADER_LINES = 30
WINDOW_LINES = 50
MAX_WINDOWS = 4
MAX_CHUNK_CHARS = 4000
MAX_CHUNKS = 3000


@dataclass(frozen=True)
class Chunk:
    file_path: str
    start_line: int
    end_line: int
    symbol: Optional[str]
    content: str

    @property
    def key(self) -> tuple[str, int, int]:
        return (self.file_path, self.start_line, self.end_line)

    def embedding_text(self) -> str:
        head = f"{self.file_path} {self.symbol}" if self.symbol else self.file_path
        return f"{head}\n{self.content}"


def repo_digest(files: list[ScanFile]) -> str:
    digest = hashlib.sha256()
    for file in sorted(files, key=lambda f: f.path):
        body = hashlib.sha256((file.content or "").encode("utf-8")).hexdigest()
        digest.update(f"{file.path}\0{file.size}\0{body}\n".encode("utf-8"))
    return digest.hexdigest()


def repo_hash(files: list[ScanFile], model_name: str) -> str:
    return hashlib.sha256(f"{repo_digest(files)}|{model_name}".encode("utf-8")).hexdigest()


def line_counts(files: list[ScanFile]) -> dict[str, int]:
    return {f.path: len((f.content or "").splitlines()) for f in files if f.content is not None}


def _slice(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1 : end])[:MAX_CHUNK_CHARS]


def _non_blank(text: str) -> int:
    return sum(1 for line in text.splitlines() if line.strip())


def build_chunks(files: list[ScanFile], symbols: list[Symbol]) -> list[Chunk]:
    by_file: dict[str, list[Symbol]] = {}
    for symbol in symbols:
        by_file.setdefault(symbol.fileId, []).append(symbol)

    chunks: list[Chunk] = []
    for file in sorted(files, key=lambda f: f.path):
        if file.content is None or file.isEmpty:
            continue
        lines = file.content.splitlines()
        if not lines:
            continue
        found = sorted(by_file.get(file.path, []), key=lambda s: (s.startLine, s.endLine))
        if not found:
            for index in range(MAX_WINDOWS):
                start = index * WINDOW_LINES + 1
                if start > len(lines):
                    break
                end = min(len(lines), start + WINDOW_LINES - 1)
                text = _slice(lines, start, end)
                if _non_blank(text):
                    chunks.append(Chunk(file.path, start, end, None, text))
            continue
        header_end = min(len(lines), HEADER_LINES, found[0].startLine - 1) if found[0].startLine > 1 else 0
        if header_end >= 1:
            text = _slice(lines, 1, header_end)
            if _non_blank(text) >= 2:
                chunks.append(Chunk(file.path, 1, header_end, None, text))
        for symbol in found:
            limit = MAX_CLASS_LINES if symbol.kind == "class" else MAX_FUNCTION_LINES
            start = min(symbol.startLine, len(lines))
            end = min(symbol.endLine, start + limit - 1, len(lines))
            chunks.append(Chunk(file.path, start, end, symbol.name, _slice(lines, start, end)))
    return chunks[:MAX_CHUNKS]

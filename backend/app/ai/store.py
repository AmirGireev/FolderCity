# Keeps indexed repos: in memory for tests and small setups, in Postgres (pgvector) for the real app.
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional, Protocol

from ..models import ArchitectureNode
from .chunking import Chunk
from .embeddings import cosine


@dataclass(frozen=True)
class RepoInfo:
    root_name: str
    files: dict[str, int]
    architecture: list[ArchitectureNode]


class ChunkStore(Protocol):
    def has_repo(self, repo_hash: str) -> bool: ...

    def save_repo(
        self,
        repo_hash: str,
        info: RepoInfo,
        chunks: list[Chunk],
        embeddings: Optional[list[list[float]]],
    ) -> None: ...

    def repo_info(self, repo_hash: str) -> Optional[RepoInfo]: ...

    def chunks(self, repo_hash: str) -> list[Chunk]: ...

    def vector_search(self, repo_hash: str, embedding: list[float], limit: int) -> list[Chunk]: ...


class MemoryStore:
    def __init__(self) -> None:
        self._repos: dict[str, tuple[RepoInfo, list[Chunk], Optional[list[list[float]]]]] = {}

    def has_repo(self, repo_hash: str) -> bool:
        return repo_hash in self._repos

    def save_repo(self, repo_hash, info, chunks, embeddings) -> None:
        self._repos[repo_hash] = (info, list(chunks), embeddings)

    def repo_info(self, repo_hash: str) -> Optional[RepoInfo]:
        entry = self._repos.get(repo_hash)
        return entry[0] if entry else None

    def chunks(self, repo_hash: str) -> list[Chunk]:
        entry = self._repos.get(repo_hash)
        return list(entry[1]) if entry else []

    def vector_search(self, repo_hash: str, embedding: list[float], limit: int) -> list[Chunk]:
        entry = self._repos.get(repo_hash)
        if not entry or entry[2] is None:
            return []
        scored = sorted(
            zip(entry[1], entry[2]), key=lambda pair: cosine(embedding, pair[1]), reverse=True
        )
        return [chunk for chunk, _ in scored[:limit]]


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{x:.6g}" for x in vector) + "]"


class PgStore:
    def __init__(self, dsn: str, dimension: int) -> None:
        self.dsn = dsn
        self.dimension = dimension
        self._ready = False

    def _connect(self):
        import psycopg

        return psycopg.connect(self.dsn)

    def ensure_schema(self) -> None:
        if self._ready:
            return
        with self._connect() as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS repos ("
                "repo_hash text PRIMARY KEY, root_name text NOT NULL, "
                "architecture jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS repo_files ("
                "repo_hash text NOT NULL REFERENCES repos(repo_hash) ON DELETE CASCADE, "
                "file_path text NOT NULL, line_count integer NOT NULL, PRIMARY KEY (repo_hash, file_path))"
            )
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS chunks ("
                f"id bigserial PRIMARY KEY, "
                f"repo_hash text NOT NULL REFERENCES repos(repo_hash) ON DELETE CASCADE, "
                f"file_path text NOT NULL, start_line integer NOT NULL, end_line integer NOT NULL, "
                f"symbol text, content text NOT NULL, embedding vector({self.dimension}))"
            )
            conn.execute("CREATE INDEX IF NOT EXISTS chunks_repo_idx ON chunks (repo_hash)")
        self._ready = True

    def has_repo(self, repo_hash: str) -> bool:
        self.ensure_schema()
        with self._connect() as conn:
            row = conn.execute("SELECT 1 FROM repos WHERE repo_hash = %s", (repo_hash,)).fetchone()
        return row is not None

    def save_repo(self, repo_hash, info, chunks, embeddings) -> None:
        self.ensure_schema()
        with self._connect() as conn:
            conn.execute("DELETE FROM repos WHERE repo_hash = %s", (repo_hash,))
            conn.execute(
                "INSERT INTO repos (repo_hash, root_name, architecture) VALUES (%s, %s, %s::jsonb)",
                (repo_hash, info.root_name, json.dumps([a.model_dump(mode="json") for a in info.architecture])),
            )
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO repo_files (repo_hash, file_path, line_count) VALUES (%s, %s, %s)",
                    [(repo_hash, path, count) for path, count in info.files.items()],
                )
                rows = []
                for index, chunk in enumerate(chunks):
                    vector = _vector_literal(embeddings[index]) if embeddings is not None else None
                    rows.append((repo_hash, chunk.file_path, chunk.start_line, chunk.end_line, chunk.symbol, chunk.content, vector))
                cur.executemany(
                    "INSERT INTO chunks (repo_hash, file_path, start_line, end_line, symbol, content, embedding) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s::vector)",
                    rows,
                )

    def repo_info(self, repo_hash: str) -> Optional[RepoInfo]:
        self.ensure_schema()
        with self._connect() as conn:
            repo = conn.execute(
                "SELECT root_name, architecture FROM repos WHERE repo_hash = %s", (repo_hash,)
            ).fetchone()
            if repo is None:
                return None
            files = conn.execute(
                "SELECT file_path, line_count FROM repo_files WHERE repo_hash = %s", (repo_hash,)
            ).fetchall()
        architecture = repo[1] if isinstance(repo[1], list) else json.loads(repo[1])
        return RepoInfo(
            root_name=repo[0],
            files={path: count for path, count in files},
            architecture=[ArchitectureNode.model_validate(item) for item in architecture],
        )

    def chunks(self, repo_hash: str) -> list[Chunk]:
        self.ensure_schema()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT file_path, start_line, end_line, symbol, content FROM chunks "
                "WHERE repo_hash = %s ORDER BY file_path, start_line, end_line",
                (repo_hash,),
            ).fetchall()
        return [Chunk(*row) for row in rows]

    def vector_search(self, repo_hash: str, embedding: list[float], limit: int) -> list[Chunk]:
        self.ensure_schema()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT file_path, start_line, end_line, symbol, content FROM chunks "
                "WHERE repo_hash = %s AND embedding IS NOT NULL "
                "ORDER BY embedding <=> %s::vector LIMIT %s",
                (repo_hash, _vector_literal(embedding), limit),
            ).fetchall()
        return [Chunk(*row) for row in rows]


def default_store(dimension: int) -> ChunkStore:
    dsn = os.environ.get("DATABASE_URL")
    return PgStore(dsn, dimension) if dsn else MemoryStore()

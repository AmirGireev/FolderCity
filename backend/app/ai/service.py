# Wires the AI layer together: indexing a repo once, answering questions and protecting the costs.
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from ..models import ArchitectureNode, Symbol
from ..scan.model import ScanFile
from .assistant import Answer, Assistant
from .chunking import build_chunks, line_counts, repo_hash
from .embeddings import Embedder, default_embedder
from .limits import RateLimiter
from .llm import LLM, default_llm
from .store import ChunkStore, RepoInfo, default_store
from .tour import StationFacts, StationText, write_station_texts

KEYWORD_ONLY_MODEL = "keyword-only"
EMBED_BATCH = 64


@dataclass(frozen=True)
class IndexResult:
    repo_hash: str
    chunks: int
    cached: bool
    search_mode: str


class AssistantService:
    def __init__(
        self,
        store: ChunkStore,
        embedder: Optional[Embedder],
        llm: Optional[LLM],
        ask_limiter: RateLimiter,
        index_limiter: RateLimiter,
    ) -> None:
        self.store = store
        self.embedder = embedder
        self.llm = llm
        self.ask_limiter = ask_limiter
        self.index_limiter = index_limiter
        self.assistant = Assistant(store, embedder, llm)

    @property
    def status(self) -> dict[str, bool]:
        return {"ai": self.llm is not None, "embeddings": self.embedder is not None}

    def index(
        self,
        root_name: str,
        files: list[ScanFile],
        symbols: list[Symbol],
        architecture: list[ArchitectureNode],
    ) -> IndexResult:
        chunks = build_chunks(files, symbols)
        embeddings: Optional[list[list[float]]] = None
        model_name = KEYWORD_ONLY_MODEL
        if self.embedder is not None:
            model_name = self.embedder.model_name
        key = repo_hash(files, model_name)
        if self.store.has_repo(key):
            return IndexResult(key, len(chunks), True, "hybrid" if self.embedder is not None else "keyword")

        if self.embedder is not None:
            try:
                embeddings = []
                texts = [chunk.embedding_text() for chunk in chunks]
                for start in range(0, len(texts), EMBED_BATCH):
                    embeddings += self.embedder.embed(texts[start : start + EMBED_BATCH])
            except Exception:
                embeddings = None
                model_name = KEYWORD_ONLY_MODEL
                key = repo_hash(files, model_name)
                if self.store.has_repo(key):
                    return IndexResult(key, len(chunks), True, "keyword")
        info = RepoInfo(root_name=root_name, files=line_counts(files), architecture=architecture)
        self.store.save_repo(key, info, chunks, embeddings)
        return IndexResult(key, len(chunks), False, "hybrid" if embeddings is not None else "keyword")

    def ask(self, repo_hash_value: str, question: str) -> Answer:
        return self.assistant.ask(repo_hash_value, question)

    def tour_texts(self, repo_name: str, stations: list[StationFacts]) -> list[StationText]:
        return write_station_texts(self.llm, repo_name, stations)


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@lru_cache(maxsize=1)
def get_service() -> AssistantService:
    embedder = default_embedder()
    dimension = embedder.dimension if embedder is not None else 384
    per_minute = _int_env("RATE_LIMIT_PER_MINUTE", 10)
    per_day = _int_env("RATE_LIMIT_PER_DAY", 200)
    index_per_hour = _int_env("INDEX_LIMIT_PER_HOUR", 10)
    return AssistantService(
        store=default_store(dimension),
        embedder=embedder,
        llm=default_llm(),
        ask_limiter=RateLimiter([(per_minute, 60), (per_day, 86_400)]),
        index_limiter=RateLimiter([(index_per_hour, 3_600)]),
    )

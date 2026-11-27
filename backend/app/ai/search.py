# Hybrid search: vector similarity plus keywords (BM25), merged with Reciprocal Rank Fusion.
from __future__ import annotations

import math
from collections import Counter
from typing import Optional

from ..models import ArchitectureNode
from .chunking import Chunk
from .embeddings import Embedder, split_words
from .store import ChunkStore

STOPWORDS = frozenset(
    "a an and are as at be by can do does for from how i in is it of on or that the this to was what when where "
    "which who why with show me find tell about code file function class "
    "wo wie was wird werden ist sind die der das den dem ein eine einen im in und oder von mit fuer für zu".split()
)
RRF_K = 60
BM25_K1 = 1.5
BM25_B = 0.75
PATH_WEIGHT = 2
SYMBOL_WEIGHT = 3
ARCH_WEIGHT = 2
CANDIDATES = 30


def question_terms(question: str) -> list[str]:
    return [w for w in split_words(question) if w not in STOPWORDS]


def _doc_tokens(chunk: Chunk, arch_labels: list[str]) -> list[str]:
    tokens = split_words(chunk.content)
    tokens += split_words(chunk.file_path) * PATH_WEIGHT
    if chunk.symbol:
        tokens += split_words(chunk.symbol) * SYMBOL_WEIGHT
    for label in arch_labels:
        tokens += split_words(label) * ARCH_WEIGHT
    return tokens


def keyword_search(
    chunks: list[Chunk], question: str, architecture: Optional[list[ArchitectureNode]] = None, limit: int = CANDIDATES
) -> list[Chunk]:
    terms = question_terms(question)
    if not terms or not chunks:
        return []
    labels_by_file: dict[str, list[ArchitectureNode]] = {}
    for item in architecture or []:
        labels_by_file.setdefault(item.fileId, []).append(item)

    documents = []
    for chunk in chunks:
        labels = [a.label for a in labels_by_file.get(chunk.file_path, []) if chunk.start_line <= a.line <= chunk.end_line]
        documents.append(Counter(_doc_tokens(chunk, labels)))
    lengths = [sum(doc.values()) for doc in documents]
    average = (sum(lengths) / len(lengths)) or 1.0
    frequency = Counter(term for doc in documents for term in set(doc))
    total = len(documents)

    scored: list[tuple[float, int]] = []
    for index, doc in enumerate(documents):
        score = 0.0
        for term in set(terms):
            tf = doc.get(term, 0)
            if not tf:
                continue
            idf = math.log(1 + (total - frequency[term] + 0.5) / (frequency[term] + 0.5))
            score += idf * tf * (BM25_K1 + 1) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * lengths[index] / average))
        if score > 0:
            scored.append((score, index))
    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    return [chunks[index] for _, index in scored[:limit]]


def reciprocal_rank_fusion(rankings: list[list[Chunk]], k: int = RRF_K) -> list[Chunk]:
    scores: dict[tuple[str, int, int], float] = {}
    chunks: dict[tuple[str, int, int], Chunk] = {}
    for ranking in rankings:
        for position, chunk in enumerate(ranking):
            scores[chunk.key] = scores.get(chunk.key, 0.0) + 1.0 / (k + position + 1)
            chunks.setdefault(chunk.key, chunk)
    order = sorted(scores, key=lambda key: (-scores[key], key))
    return [chunks[key] for key in order]


def hybrid_search(
    store: ChunkStore,
    repo_hash: str,
    question: str,
    embedder: Optional[Embedder],
    architecture: Optional[list[ArchitectureNode]] = None,
    limit: int = 10,
) -> list[Chunk]:
    rankings = [keyword_search(store.chunks(repo_hash), question, architecture)]
    if embedder is not None:
        vector = embedder.embed([question])[0]
        rankings.append(store.vector_search(repo_hash, vector, CANDIDATES))
    return reciprocal_rank_fusion(rankings)[:limit]

# Turns text into vectors: a small local ONNX model (fastembed) and a simple deterministic one for tests.
from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Optional, Protocol

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_DIMENSION = 384
BATCH_SIZE = 32


class Embedder(Protocol):
    model_name: str
    dimension: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def split_words(text: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return [w for w in re.split(r"[^A-Za-z0-9]+", spaced.lower()) if len(w) > 1]


class HashingEmbedder:
    def __init__(self, dimension: int = 256) -> None:
        self.model_name = f"hashing-{dimension}"
        self.dimension = dimension

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        for word in split_words(text):
            digest = hashlib.md5(word.encode("utf-8")).digest()
            slot = int.from_bytes(digest[:4], "big") % self.dimension
            vector[slot] += 1.0 if digest[4] % 2 == 0 else -1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]


class FastEmbedder:
    def __init__(self, model_name: str = DEFAULT_MODEL, dimension: int = DEFAULT_DIMENSION) -> None:
        self.model_name = model_name
        self.dimension = dimension
        self._model = None

    def _load(self):
        if self._model is None:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(self.model_name)
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        vectors = [[float(x) for x in vector] for vector in model.embed(texts, batch_size=BATCH_SIZE)]
        if vectors and len(vectors[0]) != self.dimension:
            raise ValueError(
                f"The model {self.model_name} gives {len(vectors[0])} numbers per text, "
                f"but EMBEDDING_DIM is {self.dimension}."
            )
        return vectors


def default_embedder() -> Optional[Embedder]:
    if os.environ.get("EMBEDDINGS", "on").lower() in ("off", "0", "false", "no"):
        return None
    try:
        import fastembed  # noqa: F401
    except ImportError:
        return None
    return FastEmbedder(
        os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL),
        int(os.environ.get("EMBEDDING_DIM", str(DEFAULT_DIMENSION))),
    )


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0

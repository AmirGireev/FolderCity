# Cost protection: a rate limit per client and a cache for answers.
from __future__ import annotations

import time
from collections import OrderedDict, deque
from typing import Callable, Generic, Optional, TypeVar

T = TypeVar("T")


class RateLimiter:
    def __init__(self, rules: list[tuple[int, float]], clock: Callable[[], float] = time.monotonic) -> None:
        self.rules = rules
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> Optional[int]:
        now = self._clock()
        longest = max(window for _, window in self.rules)
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] > longest:
            hits.popleft()
        for maximum, window in self.rules:
            recent = [t for t in hits if now - t <= window]
            if len(recent) >= maximum:
                return max(1, int(window - (now - recent[0])) + 1)
        hits.append(now)
        return None

    def forget_idle(self) -> None:
        now = self._clock()
        longest = max(window for _, window in self.rules)
        for key in [k for k, hits in self._hits.items() if not hits or now - hits[-1] > longest]:
            del self._hits[key]


class AnswerCache(Generic[T]):
    def __init__(self, max_entries: int = 500, ttl_seconds: float = 3600, clock: Callable[[], float] = time.monotonic) -> None:
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self._items: OrderedDict[tuple[str, str], tuple[float, T]] = OrderedDict()

    @staticmethod
    def normalize(question: str) -> str:
        return " ".join(question.lower().split())

    def get(self, repo_hash: str, question: str) -> Optional[T]:
        key = (repo_hash, self.normalize(question))
        entry = self._items.get(key)
        if entry is None:
            return None
        if self._clock() - entry[0] > self.ttl_seconds:
            del self._items[key]
            return None
        self._items.move_to_end(key)
        return entry[1]

    def put(self, repo_hash: str, question: str, value: T) -> None:
        key = (repo_hash, self.normalize(question))
        self._items[key] = (self._clock(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.max_entries:
            self._items.popitem(last=False)

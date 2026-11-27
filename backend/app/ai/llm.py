# Talks to a free OpenAI-compatible language model (Gemini) and switches to a lighter model when the first one fails.
from __future__ import annotations

import os
import time
from typing import Any, Callable, Optional, Protocol

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_LLM_MODEL = "gemini-2.5-flash"
DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash-lite"
REQUEST_TIMEOUT_SECONDS = 40
FALLBACK_COOLDOWN_SECONDS = 60


class LlmError(Exception):
    pass


class LLM(Protocol):
    def complete(self, system: str, user: str, max_tokens: int) -> str: ...


class OpenAICompatibleLLM:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        models: list[str],
        client: Any = None,
        clock: Callable[[], float] = time.monotonic,
        cooldown_seconds: float = FALLBACK_COOLDOWN_SECONDS,
    ) -> None:
        self.models = [m for m in models if m]
        self._api_key = api_key
        self._base_url = base_url
        self._client = client
        self._clock = clock
        self._cooldown_seconds = cooldown_seconds
        self._skip_until: dict[str, float] = {}

    def _get_client(self) -> Any:
        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI(api_key=self._api_key, base_url=self._base_url, timeout=REQUEST_TIMEOUT_SECONDS)
        return self._client

    def _order(self) -> list[str]:
        now = self._clock()
        ready = [m for m in self.models if self._skip_until.get(m, 0.0) <= now]
        resting = [m for m in self.models if m not in ready]
        return ready + resting

    def complete(self, system: str, user: str, max_tokens: int) -> str:
        last_problem = "no model is configured"
        for model in self._order():
            try:
                response = self._get_client().chat.completions.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                )
                text = response.choices[0].message.content or ""
            except Exception as err:
                last_problem = type(err).__name__
                self._skip_until[model] = self._clock() + self._cooldown_seconds
                continue
            if text.strip():
                return text
            last_problem = "empty answer"
            self._skip_until[model] = self._clock() + self._cooldown_seconds
        raise LlmError(f"The language model request failed ({last_problem}).")


def default_llm() -> Optional[LLM]:
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not key:
        return None
    primary = os.environ.get("LLM_MODEL", "").strip() or DEFAULT_LLM_MODEL
    fallback = os.environ.get("LLM_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL).strip()
    models = [primary] + ([fallback] if fallback and fallback != primary else [])
    return OpenAICompatibleLLM(key, os.environ.get("LLM_BASE_URL", "").strip() or DEFAULT_BASE_URL, models)

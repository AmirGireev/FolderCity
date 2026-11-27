# Talks to the language model. The API key only exists here on the server.
from __future__ import annotations

import os
from typing import Optional, Protocol

DEFAULT_LLM_MODEL = "claude-haiku-5-5"
REQUEST_TIMEOUT_SECONDS = 40


class LlmError(Exception):
    pass


class LLM(Protocol):
    def complete(self, system: str, user: str, max_tokens: int) -> str: ...


class AnthropicLLM:
    def __init__(self, api_key: str, model: str = DEFAULT_LLM_MODEL) -> None:
        self.model = model
        self._api_key = api_key
        self._client = None

    def complete(self, system: str, user: str, max_tokens: int) -> str:
        try:
            if self._client is None:
                import anthropic

                self._client = anthropic.Anthropic(api_key=self._api_key, timeout=REQUEST_TIMEOUT_SECONDS)
            message = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as err:
            raise LlmError(f"The language model request failed ({type(err).__name__}).") from err
        return "".join(block.text for block in message.content if getattr(block, "type", "") == "text")


def default_llm() -> Optional[LLM]:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    return AnthropicLLM(key, os.environ.get("ANTHROPIC_MODEL", DEFAULT_LLM_MODEL))

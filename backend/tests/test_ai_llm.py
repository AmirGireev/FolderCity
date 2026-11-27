# Tests the language model client: switching to the lighter model, the cooldown and the settings.
import pytest

from app.ai.llm import (
    DEFAULT_BASE_URL,
    DEFAULT_FALLBACK_MODEL,
    DEFAULT_LLM_MODEL,
    LlmError,
    OpenAICompatibleLLM,
    default_llm,
)


class FakeClient:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = []
        self.chat = self
        self.completions = self

    def create(self, model, max_tokens, messages):
        self.calls.append((model, max_tokens, messages))
        result = self.behaviour(model)
        if isinstance(result, Exception):
            raise result
        message = type("Message", (), {"content": result})()
        return type("Response", (), {"choices": [type("Choice", (), {"message": message})()]})()


def make(behaviour, models=("flash", "lite"), now=None):
    clock = (lambda: now[0]) if now is not None else (lambda: 0.0)
    client = FakeClient(behaviour)
    return OpenAICompatibleLLM("key", "http://x", list(models), client=client, clock=clock, cooldown_seconds=60), client


def used(client):
    return [call[0] for call in client.calls]


def test_the_first_model_answers_when_it_works():
    llm, client = make(lambda model: f"answer from {model}")
    assert llm.complete("sys", "user", 50) == "answer from flash"
    assert used(client) == ["flash"]
    model, max_tokens, messages = client.calls[0]
    assert max_tokens == 50
    assert messages == [{"role": "system", "content": "sys"}, {"role": "user", "content": "user"}]


def test_a_failing_model_switches_to_the_lighter_one():
    llm, client = make(lambda model: RuntimeError("quota") if model == "flash" else "from lite")
    assert llm.complete("s", "u", 10) == "from lite"
    assert used(client) == ["flash", "lite"]


def test_an_empty_answer_counts_as_a_failure():
    llm, client = make(lambda model: "" if model == "flash" else "from lite")
    assert llm.complete("s", "u", 10) == "from lite"
    llm2, _ = make(lambda model: None if model == "flash" else "ok")
    assert llm2.complete("s", "u", 10) == "ok"
    llm3, _ = make(lambda model: "   ")
    with pytest.raises(LlmError):
        llm3.complete("s", "u", 10)


def test_the_broken_model_rests_for_a_while_and_is_tried_again_later():
    now = [0.0]
    broken = {"flash": True}
    llm, client = make(lambda model: RuntimeError("limit") if model == "flash" and broken["flash"] else f"from {model}", now=now)
    assert llm.complete("s", "u", 1) == "from lite"
    assert llm.complete("s", "u", 1) == "from lite"
    assert used(client) == ["flash", "lite", "lite"]
    now[0] = 61
    broken["flash"] = False
    assert llm.complete("s", "u", 1) == "from flash"
    assert used(client)[-1] == "flash"


def test_when_every_model_rests_they_are_all_still_tried():
    now = [0.0]
    state = {"fail": True}
    llm, client = make(lambda model: RuntimeError("down") if state["fail"] else "back", now=now)
    with pytest.raises(LlmError, match="RuntimeError"):
        llm.complete("s", "u", 1)
    state["fail"] = False
    assert llm.complete("s", "u", 1) == "back"
    assert used(client) == ["flash", "lite", "flash"]


def test_the_error_names_the_problem_but_never_the_key():
    llm, _ = make(lambda model: ValueError("secret-key-123 leaked"))
    with pytest.raises(LlmError) as caught:
        llm.complete("s", "u", 1)
    assert "ValueError" in str(caught.value)
    assert "secret-key-123" not in str(caught.value)


def test_a_single_model_without_fallback_still_works():
    llm, client = make(lambda model: "only", models=("flash",))
    assert llm.complete("s", "u", 1) == "only"
    failing, _ = make(lambda model: RuntimeError("x"), models=("flash",))
    with pytest.raises(LlmError):
        failing.complete("s", "u", 1)


def test_no_models_gives_an_error():
    llm, _ = make(lambda model: "x", models=())
    with pytest.raises(LlmError):
        llm.complete("s", "u", 1)


@pytest.fixture
def clean_env(monkeypatch):
    for name in ("LLM_API_KEY", "LLM_MODEL", "LLM_FALLBACK_MODEL", "LLM_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_no_key_means_no_model(clean_env):
    assert default_llm() is None
    clean_env.setenv("LLM_API_KEY", "   ")
    assert default_llm() is None


def test_defaults_are_gemini_flash_then_flash_lite(clean_env):
    clean_env.setenv("LLM_API_KEY", "k")
    llm = default_llm()
    assert llm.models == [DEFAULT_LLM_MODEL, DEFAULT_FALLBACK_MODEL]
    assert llm._base_url == DEFAULT_BASE_URL
    assert (DEFAULT_LLM_MODEL, DEFAULT_FALLBACK_MODEL) == ("gemini-2.5-flash", "gemini-2.5-flash-lite")


def test_models_and_address_can_be_set(clean_env):
    clean_env.setenv("LLM_API_KEY", "k")
    clean_env.setenv("LLM_MODEL", "big")
    clean_env.setenv("LLM_FALLBACK_MODEL", "small")
    clean_env.setenv("LLM_BASE_URL", "http://other/v1")
    llm = default_llm()
    assert llm.models == ["big", "small"] and llm._base_url == "http://other/v1"


def test_the_fallback_can_be_turned_off_or_equal_to_the_first(clean_env):
    clean_env.setenv("LLM_API_KEY", "k")
    clean_env.setenv("LLM_FALLBACK_MODEL", "")
    assert default_llm().models == [DEFAULT_LLM_MODEL]
    clean_env.setenv("LLM_FALLBACK_MODEL", DEFAULT_LLM_MODEL)
    assert default_llm().models == [DEFAULT_LLM_MODEL]


def test_the_real_client_can_be_created_without_calling_the_network():
    llm = OpenAICompatibleLLM("k", "http://localhost:9/v1", ["m"])
    assert llm._get_client().base_url is not None

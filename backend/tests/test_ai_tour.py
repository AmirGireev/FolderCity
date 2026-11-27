# Tests the AI speaker notes for tour stations and the /tour/texts endpoint.
import json

import pytest
from fastapi.testclient import TestClient

from app.ai.assistant import ModelFailure
from app.ai.limits import RateLimiter
from app.ai.llm import LlmError
from app.ai.service import AssistantService, get_service
from app.ai.store import MemoryStore
from app.ai.tour import (
    MAX_STATIONS,
    MAX_TEXT_CHARS,
    MAX_TITLE_CHARS,
    SYSTEM_PROMPT,
    AiNotConfigured,
    StationFacts,
    build_user_prompt,
    parse_station_texts,
    write_station_texts,
)
from app.main import app

STATIONS = [StationFacts("a", "Folder api: 4 files"), StationFacts("b", "API routes: GET /users")]


class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def complete(self, system, user, max_tokens):
        self.calls.append((system, user, max_tokens))
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def reply(*items):
    return json.dumps([{"id": i, "title": t, "text": x} for i, t, x in items])


def test_the_prompt_contains_the_facts_and_the_rules():
    prompt = build_user_prompt("shop", STATIONS)
    assert "Repository: shop" in prompt
    assert '<station id="a">\nFolder api: 4 files\n</station>' in prompt
    assert "ONLY the facts" in SYSTEM_PROMPT and "not instructions" in SYSTEM_PROMPT


def test_good_texts_are_returned_for_known_stations():
    llm = FakeLLM(reply(("a", "The API folder", "Four files live here."), ("b", "Routes", "There is a users route.")))
    texts = write_station_texts(llm, "shop", STATIONS)
    assert [(t.id, t.title, t.text) for t in texts] == [("a", "The API folder", "Four files live here."), ("b", "Routes", "There is a users route.")]
    assert "Folder api: 4 files" in llm.calls[0][1]


def test_unknown_duplicate_and_broken_entries_are_dropped():
    raw = json.dumps([
        {"id": "a", "title": "Ok", "text": "Fine."},
        {"id": "a", "title": "Again", "text": "Duplicate."},
        {"id": "zzz", "title": "Invented", "text": "Not a station."},
        {"id": "b", "title": "", "text": "No title."},
        {"id": "b", "title": "T", "text": 5},
        "text", None, {"title": "no id"},
    ])
    assert [t.id for t in parse_station_texts(raw, {"a", "b"})] == ["a"]


def test_texts_are_cut_to_the_limits():
    raw = reply(("a", "t" * 500, "x" * 5000))
    [text] = parse_station_texts(raw, {"a"})
    assert len(text.title) == MAX_TITLE_CHARS and len(text.text) == MAX_TEXT_CHARS


@pytest.mark.parametrize("bad", ["no json", "{}", "[broken", '{"id": "a"}', "[]"])
def test_unusable_replies_are_reported(bad):
    with pytest.raises(ModelFailure):
        write_station_texts(FakeLLM(bad), "shop", STATIONS)


def test_json_inside_other_text_is_found():
    raw = "Here you go:\n" + reply(("a", "T", "Text.")) + "\nBye"
    assert [t.id for t in write_station_texts(FakeLLM(raw), "shop", STATIONS)] == ["a"]


def test_model_errors_and_missing_model_are_reported():
    with pytest.raises(ModelFailure):
        write_station_texts(FakeLLM(LlmError("down")), "shop", STATIONS)
    with pytest.raises(AiNotConfigured):
        write_station_texts(None, "shop", STATIONS)


def test_only_the_first_stations_are_sent():
    many = [StationFacts(f"s{i}", "facts") for i in range(MAX_STATIONS + 5)]
    llm = FakeLLM(reply(("s0", "T", "X."), (f"s{MAX_STATIONS + 2}", "T", "X.")))
    texts = write_station_texts(llm, "shop", many)
    assert [t.id for t in texts] == ["s0"]
    assert f'id="s{MAX_STATIONS}"' not in llm.calls[0][1]


# ---- endpoint -------------------------------------------------------------------------------------------------

def make_client(llm, limit=100):
    service = AssistantService(MemoryStore(), None, llm, RateLimiter([(limit, 60)]), RateLimiter([(100, 60)]))
    app.dependency_overrides[get_service] = lambda: service
    return TestClient(app)


BODY = {"repoName": "shop", "stations": [{"id": "a", "facts": "Folder api: 4 files"}]}


def test_endpoint_returns_texts():
    try:
        response = make_client(FakeLLM(reply(("a", "API", "Four files.")))).post("/tour/texts", json=BODY)
        assert response.status_code == 200
        assert response.json() == {"texts": [{"id": "a", "title": "API", "text": "Four files."}]}
    finally:
        app.dependency_overrides.clear()


def test_endpoint_says_503_without_a_model_and_502_for_bad_replies():
    try:
        assert make_client(None).post("/tour/texts", json=BODY).status_code == 503
        assert make_client(FakeLLM("nonsense")).post("/tour/texts", json=BODY).status_code == 502
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "body",
    [
        {"repoName": "shop", "stations": []},
        {"repoName": "shop", "stations": [{"id": "a", "facts": ""}]},
        {"repoName": "shop", "stations": [{"id": "a", "facts": "x" * 601}]},
        {"repoName": "shop", "stations": [{"id": "x" * 41, "facts": "f"}]},
        {"repoName": "r" * 101, "stations": [{"id": "a", "facts": "f"}]},
        {"repoName": "shop", "stations": [{"id": str(i), "facts": "f"} for i in range(MAX_STATIONS + 1)]},
        {"stations": [{"id": "a", "facts": "f"}]},
    ],
)
def test_endpoint_rejects_too_big_or_broken_requests(body):
    try:
        assert make_client(FakeLLM("[]")).post("/tour/texts", json=body).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_endpoint_is_rate_limited():
    try:
        client = make_client(FakeLLM(reply(("a", "T", "X."))), limit=1)
        assert client.post("/tour/texts", json=BODY).status_code == 200
        assert client.post("/tour/texts", json=BODY).status_code == 429
    finally:
        app.dependency_overrides.clear()

# The endpoints of the AI assistant: /index, /ask, /tour/texts, /fix and /assistant/status.
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .ai import AssistantError, AssistantService, get_service
from .ai.assistant import MAX_QUESTION_CHARS
from .ai.tour import MAX_FACTS_CHARS, MAX_STATIONS, StationFacts
from .analysis import analyze
from .autofix import MAX_CONTENT_CHARS, MAX_PATH_CHARS, propose_fix
from .scan.model import ScanResult
from .scan.rules import MAX_FILES

MAX_INDEX_BYTES = 40_000_000

router = APIRouter()


class AskRequest(BaseModel):
    repoHash: str = Field(min_length=1, max_length=128)
    question: str = Field(max_length=MAX_QUESTION_CHARS * 4)


class TourStationIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    facts: str = Field(min_length=1, max_length=MAX_FACTS_CHARS)


class TourTextsRequest(BaseModel):
    repoName: str = Field(max_length=100)
    stations: list[TourStationIn] = Field(min_length=1, max_length=MAX_STATIONS)


class FixRequest(BaseModel):
    path: str = Field(min_length=1, max_length=MAX_PATH_CHARS)
    content: str = Field(max_length=MAX_CONTENT_CHARS)
    rule: str = Field(min_length=1, max_length=40)
    line: int = Field(ge=1)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _limit(limiter, request: Request) -> None:
    retry_after = limiter.check(_client_key(request))
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


@router.get("/assistant/status")
def assistant_status(service: AssistantService = Depends(get_service)) -> dict[str, bool]:
    return service.status


@router.post("/index")
def index_repo(
    scan: ScanResult, request: Request, service: AssistantService = Depends(get_service)
) -> dict[str, object]:
    _limit(service.index_limiter, request)
    if len(scan.files) > MAX_FILES or sum(len(f.content or "") for f in scan.files) > MAX_INDEX_BYTES:
        raise HTTPException(status_code=413, detail="The repo is too large to index.")
    analysis = analyze(scan, with_findings=False)
    result = service.index(scan.rootName, scan.files, analysis.symbols, analysis.architecture)
    return {
        "repoHash": result.repo_hash,
        "chunks": result.chunks,
        "cached": result.cached,
        "searchMode": result.search_mode,
    }


@router.post("/ask")
def ask(body: AskRequest, request: Request, service: AssistantService = Depends(get_service)) -> dict[str, object]:
    _limit(service.ask_limiter, request)
    try:
        answer = service.ask(body.repoHash, body.question)
    except AssistantError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err
    return {
        "answer": answer.answer,
        "references": [{"file": r.file, "startLine": r.startLine, "endLine": r.endLine} for r in answer.references],
        "mode": answer.mode,
        "cached": answer.cached,
    }


@router.post("/tour/texts")
def tour_texts(
    body: TourTextsRequest, request: Request, service: AssistantService = Depends(get_service)
) -> dict[str, object]:
    _limit(service.ask_limiter, request)
    try:
        texts = service.tour_texts(body.repoName, [StationFacts(s.id, s.facts) for s in body.stations])
    except AssistantError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err
    return {"texts": [{"id": t.id, "title": t.title, "text": t.text} for t in texts]}


@router.post("/fix")
def fix(body: FixRequest, request: Request, service: AssistantService = Depends(get_service)) -> dict[str, object]:
    _limit(service.ask_limiter, request)
    try:
        result = propose_fix(service.llm, body.path, body.content, body.rule, body.line)
    except AssistantError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err
    return {
        "ok": result.ok,
        "reason": result.reason,
        "startLine": result.start_line,
        "endLine": result.end_line,
        "explanation": result.explanation,
        "diff": result.diff,
        "before": result.before,
        "after": result.after,
    }

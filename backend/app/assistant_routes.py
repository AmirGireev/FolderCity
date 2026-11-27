# The endpoints of the AI assistant: /index, /ask and /assistant/status.
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .ai import AssistantError, AssistantService, get_service
from .ai.assistant import MAX_QUESTION_CHARS
from .analysis import analyze
from .scan.model import ScanResult
from .scan.rules import MAX_FILES

MAX_INDEX_BYTES = 40_000_000

router = APIRouter()


class AskRequest(BaseModel):
    repoHash: str = Field(min_length=1, max_length=128)
    question: str = Field(max_length=MAX_QUESTION_CHARS * 4)


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
    analysis = analyze(scan)
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

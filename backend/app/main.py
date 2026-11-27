# The FastAPI app with /health, the GitHub import and the city (layout plus code analysis).
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .layout import LayoutError
from .pipeline import build_full_city
from .scan.github import GithubImportError, import_github
from .scan.model import ScanResult

app = FastAPI(title="FolderCity API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class GithubImportRequest(BaseModel):
    url: str


@app.post("/import/github", response_model=ScanResult)
def import_from_github(request: GithubImportRequest) -> ScanResult:
    try:
        return import_github(request.url)
    except GithubImportError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err


@app.post("/city", response_model=None)
def create_city(scan: ScanResult) -> JSONResponse:
    try:
        return JSONResponse(build_full_city(scan).to_json_dict())
    except LayoutError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err

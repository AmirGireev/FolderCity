from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    """Öffentliches GitHub-Repo einlesen. Liefert dasselbe Format wie der lokale Ordner."""
    try:
        return import_github(request.url)
    except GithubImportError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err

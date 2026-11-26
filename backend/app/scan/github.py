"""GitHub-Import: öffentliches Repo flach klonen, einlesen, wieder löschen.

Sicherheit (fremder Code wird nie ausgeführt):
- nur https://github.com/<besitzer>/<repo> ohne Zusatz (kein Login, kein Port, keine Query)
- git wird ohne Shell aufgerufen, Hooks aus, keine Submodule, keine Symlinks,
  kein Git-LFS, keine Nutzer- oder System-Konfiguration
- Zeitlimit und Größenlimit; danach wird das temporäre Verzeichnis gelöscht
- die Dateien werden nur gelesen (siehe walker.py)
"""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from .model import ScanResult
from .walker import scan_directory

_GITHUB_URL = re.compile(
    r"^https://github\.com/(?P<owner>[A-Za-z0-9_.-]{1,100})/(?P<repo>[A-Za-z0-9_.-]{1,100}?)(?:\.git)?/?$"
)


class GithubImportError(Exception):
    """Fehler mit passendem HTTP-Status für die API."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass(frozen=True)
class CloneLimits:
    timeout_seconds: float = 60.0
    max_bytes: int = 150 * 1024 * 1024


DEFAULT_CLONE_LIMITS = CloneLimits()


def parse_github_url(url: str) -> tuple[str, str]:
    """Prüft die URL und gibt (besitzer, repo) zurück. Wirft GithubImportError(400)."""
    match = _GITHUB_URL.match(url.strip())
    if not match:
        raise GithubImportError(
            400, "Nur öffentliche URLs der Form https://github.com/besitzer/repo sind erlaubt."
        )
    owner, repo = match.group("owner"), match.group("repo")
    if owner in {".", ".."} or repo in {".", ".."}:
        raise GithubImportError(400, "Ungültige GitHub-URL.")
    return owner, repo


def _dir_size(path: Path) -> int:
    total = 0
    stack = [str(path)]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                for entry in it:
                    if entry.is_symlink():
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                    else:
                        try:
                            total += entry.stat(follow_symlinks=False).st_size
                        except OSError:
                            pass
        except OSError:
            pass
    return total


def _safe_git_env() -> dict[str, str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": tempfile.gettempdir(),
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_LFS_SKIP_SMUDGE": "1",
        "LC_ALL": "C",
    }
    for key in ("HTTPS_PROXY", "https_proxy", "SSL_CERT_FILE", "GIT_SSL_CAINFO"):
        if key in os.environ:  # nur für Umgebungen mit Proxy
            env[key] = os.environ[key]
    return env


def _remove_tree(path: str) -> None:
    """Löscht ein Verzeichnis, auch wenn Dateien schreibgeschützt sind (Git-Objekte unter Windows)."""

    def retry(func, failed_path, _exc):
        os.chmod(failed_path, stat.S_IWRITE)
        func(failed_path)

    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=retry)
    else:
        shutil.rmtree(path, onerror=lambda f, p, e: retry(f, p, e))


def shallow_clone(clone_url: str, target: Path, limits: CloneLimits = DEFAULT_CLONE_LIMITS) -> None:
    """git clone --depth 1 mit Zeit- und Größenlimit."""
    cmd = [
        "git",
        "-c", "core.hooksPath=" + os.devnull,
        "-c", "core.symlinks=false",
        "clone",
        "--depth", "1",
        "--single-branch",
        "--no-tags",
        "--no-recurse-submodules",
        "--quiet",
        "--",
        clone_url,
        str(target),
    ]  # fmt: skip
    try:
        proc = subprocess.Popen(
            cmd,
            env=_safe_git_env(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError as exc:
        raise GithubImportError(500, "git ist auf dem Server nicht installiert.") from exc

    deadline = time.monotonic() + limits.timeout_seconds
    while proc.poll() is None:
        if time.monotonic() > deadline:
            proc.kill()
            proc.wait()
            raise GithubImportError(504, "Das Klonen hat zu lange gedauert (Zeitlimit).")
        if target.exists() and _dir_size(target) > limits.max_bytes:
            proc.kill()
            proc.wait()
            raise GithubImportError(413, "Das Repository ist zu groß (Größenlimit).")
        time.sleep(0.1)

    if proc.returncode != 0:
        raise GithubImportError(
            502, "Das Repository konnte nicht geklont werden (nicht gefunden oder nicht öffentlich?)."
        )
    if _dir_size(target) > limits.max_bytes:
        raise GithubImportError(413, "Das Repository ist zu groß (Größenlimit).")


def import_repository(
    clone_url: str, repo_name: str, limits: CloneLimits = DEFAULT_CLONE_LIMITS
) -> ScanResult:
    """Klont clone_url in ein temporäres Verzeichnis, liest es ein und löscht es wieder."""
    tmp = tempfile.mkdtemp(prefix="foldercity-clone-")
    try:
        target = Path(tmp) / repo_name
        shallow_clone(clone_url, target, limits)
        return scan_directory(target, root_name=repo_name)
    finally:
        try:
            _remove_tree(tmp)
        except OSError:
            shutil.rmtree(tmp, ignore_errors=True)


def import_github(url: str, limits: CloneLimits = DEFAULT_CLONE_LIMITS) -> ScanResult:
    owner, repo = parse_github_url(url)
    return import_repository(f"https://github.com/{owner}/{repo}.git", repo, limits)

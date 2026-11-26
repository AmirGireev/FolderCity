import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from app.scan import github
from app.scan.github import (
    CloneLimits,
    GithubImportError,
    import_github,
    import_repository,
    parse_github_url,
)
from app.scan.walker import scan_directory

GOOD = [
    ("https://github.com/octocat/Hello-World", ("octocat", "Hello-World")),
    ("https://github.com/octocat/Hello-World/", ("octocat", "Hello-World")),
    ("https://github.com/octocat/Hello-World.git", ("octocat", "Hello-World")),
    ("  https://github.com/a_b/c.d-e  ", ("a_b", "c.d-e")),
]

BAD = [
    "http://github.com/octocat/Hello-World",  # kein https
    "https://gitlab.com/octocat/Hello-World",  # anderer Anbieter
    "https://github.com.evil.com/octocat/Hello-World",
    "https://evil.com/github.com/octocat/Hello-World",
    "https://user:pw@github.com/octocat/Hello-World",  # Zugangsdaten
    "https://github.com:8080/octocat/Hello-World",  # Port
    "https://github.com/octocat",  # kein Repo
    "https://github.com/octocat/Hello-World/tree/main",  # Zusatzpfad
    "https://github.com/octocat/Hello-World?x=1",
    "https://github.com/octocat/Hello-World#frag",
    "https://github.com/../etc",
    "https://github.com/octocat/..",
    "file:///etc/passwd",
    "git@github.com:octocat/Hello-World.git",
    "ssh://git@github.com/octocat/Hello-World.git",
    "-o ProxyCommand=evil",
    "https://github.com/octocat/Hello World",
    "https://github.com/octocat/Hello-World;rm -rf /",
    "",
]


@pytest.mark.parametrize("url,expected", GOOD)
def test_valid_urls(url, expected):
    assert parse_github_url(url) == expected


@pytest.mark.parametrize("url", BAD)
def test_invalid_urls_rejected(url):
    with pytest.raises(GithubImportError) as err:
        parse_github_url(url)
    assert err.value.status_code == 400


def test_import_github_does_not_clone_invalid_urls(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("darf nicht geklont werden")

    monkeypatch.setattr(github, "shallow_clone", boom)
    with pytest.raises(GithubImportError):
        import_github("https://evil.com/x/y")


def _git(cwd: Path, *args: str) -> None:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
    }  # fmt: skip
    subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True)


@pytest.fixture
def source_repo(tmp_path) -> Path:
    """Ein kleines lokales Repo (statt GitHub) mit Dingen, die gefiltert werden müssen."""
    repo = tmp_path / "demo"
    (repo / "src").mkdir(parents=True)
    (repo / "node_modules").mkdir()
    (repo / "README.md").write_text("# Demo\n")
    (repo / "empty.txt").write_text("")
    (repo / "src" / "main.py").write_text("print('hi')\n")
    (repo / "logo.png").write_bytes(b"\x89PNG\x00")
    (repo / "node_modules" / "x.js").write_text("x")
    (repo / ".env").write_text("SECRET=1")
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "add", "-f", ".")  # .env und node_modules absichtlich mit einchecken
    _git(repo, "commit", "-q", "-m", "init")
    return repo


def test_clone_gives_same_result_as_local_folder(source_repo):
    local = scan_directory(source_repo)  # ignoriert .git, node_modules, .env
    cloned = import_repository(str(source_repo), "demo")
    assert cloned.model_dump(mode="json") == local.model_dump(mode="json")
    paths = {f.path for f in cloned.files}
    assert paths == {"README.md", "empty.txt", "src/main.py", "logo.png"}


def test_temp_directory_is_deleted(source_repo, monkeypatch):
    created: list[str] = []
    real = tempfile.mkdtemp

    def tracking(*a, **k):
        path = real(*a, **k)
        created.append(path)
        return path

    monkeypatch.setattr(github.tempfile, "mkdtemp", tracking)
    import_repository(str(source_repo), "demo")
    assert created and not any(Path(p).exists() for p in created)


def test_temp_directory_deleted_on_failure(tmp_path, monkeypatch):
    created: list[str] = []
    real = tempfile.mkdtemp
    monkeypatch.setattr(
        github.tempfile, "mkdtemp", lambda *a, **k: created.append(real(*a, **k)) or created[-1]
    )
    with pytest.raises(GithubImportError) as err:
        import_repository(str(tmp_path / "does-not-exist"), "x")
    assert err.value.status_code == 502
    assert created and not any(Path(p).exists() for p in created)


@pytest.mark.skipif(sys.platform == "win32", reason="Shell-Hook braucht ein Unix-System")
def test_hooks_are_not_run(source_repo, tmp_path):
    """Ein Repo-Hook darf beim Klonen nicht laufen."""
    marker = tmp_path / "hook-ran"
    hook = source_repo / ".git" / "hooks" / "post-checkout"
    hook.write_text(f"#!/bin/sh\ntouch {marker}\n")
    hook.chmod(0o755)
    import_repository(str(source_repo), "demo")
    assert not marker.exists()


_REAL_POPEN = subprocess.Popen


class _Sleeper:
    """Ersatz für git: läuft endlos und legt optional eine große Datei an."""

    def __init__(self, cmd, **kwargs):
        self.target = Path(cmd[-1])
        self._real = _REAL_POPEN([sys.executable, "-c", "import time; time.sleep(30)"])
        self.returncode = None

    def poll(self):
        return self._real.poll()

    def kill(self):
        self._real.kill()

    def wait(self):
        return self._real.wait()


def test_timeout(tmp_path, monkeypatch):
    monkeypatch.setattr(github.subprocess, "Popen", _Sleeper)
    with pytest.raises(GithubImportError) as err:
        github.shallow_clone("x", tmp_path / "t", CloneLimits(timeout_seconds=0.3))
    assert err.value.status_code == 504


def test_size_limit(tmp_path, monkeypatch):
    class Big(_Sleeper):
        def __init__(self, cmd, **kwargs):
            super().__init__(cmd, **kwargs)
            self.target.mkdir(parents=True)
            (self.target / "big.bin").write_bytes(b"x" * 5000)

    monkeypatch.setattr(github.subprocess, "Popen", Big)
    with pytest.raises(GithubImportError) as err:
        github.shallow_clone("x", tmp_path / "t", CloneLimits(timeout_seconds=10, max_bytes=1000))
    assert err.value.status_code == 413


def test_git_runs_without_shell_and_with_safe_options(tmp_path, monkeypatch):
    seen = {}

    class Fake:
        returncode = 0

        def __init__(self, cmd, **kwargs):
            seen["cmd"], seen["kwargs"] = cmd, kwargs

        def poll(self):
            return 0

    monkeypatch.setattr(github.subprocess, "Popen", Fake)
    github.shallow_clone("https://github.com/a/b.git", tmp_path / "t")
    cmd, kwargs = seen["cmd"], seen["kwargs"]
    assert isinstance(cmd, list) and not kwargs.get("shell")
    for flag in ("--depth", "--no-recurse-submodules", "--single-branch"):
        assert flag in cmd
    assert cmd[cmd.index("--") + 1] == "https://github.com/a/b.git"  # URL steht nach "--"
    assert any(part.startswith("core.hooksPath=") for part in cmd)
    assert kwargs["env"]["GIT_TERMINAL_PROMPT"] == "0"
    assert kwargs["env"]["GIT_CONFIG_NOSYSTEM"] == "1"

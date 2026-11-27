# Reads a folder on disk into the scan format.
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from . import rules
from .model import ScanFile, ScanResult


@dataclass(frozen=True)
class ScanLimits:
    max_file_bytes: int = rules.MAX_FILE_BYTES
    max_files: int = rules.MAX_FILES
    max_depth: int = rules.MAX_DEPTH


DEFAULT_LIMITS = ScanLimits()


def decode_text(data: bytes) -> str | None:
    if b"\x00" in data[:8000]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def scan_directory(
    root: Path, limits: ScanLimits = DEFAULT_LIMITS, root_name: str | None = None
) -> ScanResult:
    root = Path(root)
    files: list[ScanFile] = []
    directories: list[str] = []
    empty_directories: list[str] = []
    state = {"truncated": False, "stop": False}

    def list_entries(directory: Path) -> list[os.DirEntry]:
        try:
            with os.scandir(directory) as it:
                return sorted(it, key=lambda e: e.name)
        except OSError:
            return []

    def walk(directory: Path, rel: str, depth: int) -> bool:
        has_file = False
        for entry in list_entries(directory):
            if state["stop"]:
                break
            if entry.is_symlink():
                continue
            child_rel = f"{rel}/{entry.name}" if rel else entry.name
            if entry.is_dir(follow_symlinks=False):
                if rules.should_skip_directory(entry.name):
                    continue
                if depth + 1 > limits.max_depth:
                    state["truncated"] = True
                    has_file = True
                    continue
                directories.append(child_rel)
                if walk(Path(entry.path), child_rel, depth + 1):
                    has_file = True
                else:
                    empty_directories.append(child_rel)
            elif entry.is_file(follow_symlinks=False):
                if rules.should_skip_file(entry.name):
                    continue
                has_file = True
                if len(files) >= limits.max_files:
                    state["truncated"] = True
                    state["stop"] = True
                    break
                try:
                    size = entry.stat(follow_symlinks=False).st_size
                    files.append(_build(child_rel, size, Path(entry.path), limits))
                except OSError:
                    continue
        return has_file

    walk(root, "", 0)

    return ScanResult(
        rootName=root_name if root_name is not None else root.name,
        directories=sorted(directories),
        emptyDirectories=sorted(empty_directories),
        files=sorted(files, key=lambda f: f.path),
        truncated=state["truncated"],
    )


def _build(path: str, size: int, disk_path: Path, limits: ScanLimits) -> ScanFile:
    name = path.rsplit("/", 1)[-1]
    if rules.has_binary_extension(name):
        return ScanFile(path=path, size=size, content=None, omitted="binary", isEmpty=size == 0)
    if size > limits.max_file_bytes:
        return ScanFile(path=path, size=size, content=None, omitted="too_large", isEmpty=False)

    def read() -> bytes:
        with open(disk_path, "rb") as fh:
            return fh.read()

    text = decode_text(read())
    if text is None:
        return ScanFile(path=path, size=size, content=None, omitted="binary", isEmpty=size == 0)
    if rules.is_env_template(name):
        text = rules.redact_env_template(text)
    return ScanFile(
        path=path, size=size, content=text, omitted=None, isEmpty=rules.is_blank_text(text)
    )

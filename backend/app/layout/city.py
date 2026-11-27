# Turns the scan format into a CityModel with squarified treemap geometry.
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from ..models import CityModel, Dimensions, Metrics, Node, Position
from ..scan.model import ScanFile, ScanResult
from ..scan.rules import MAX_DEPTH
from .languages import extension_of, language_for
from .treemap import Rect, squarify

ROOT_ID = "."
MAX_ENTRIES = 20_000

PAD = 2.0
GAP = 0.6
FOLDER_GAP = 2.5
PLATFORM_HEIGHT = 1.0
EMPTY_FILE_HEIGHT = 0.1
MIN_BUILDING_HEIGHT = 1.0
MAX_BUILDING_HEIGHT = 40.0
HEIGHT_SQRT_SCALE = 0.4
FILE_BASE_AREA = 4.0
FILE_SIZE_FACTOR = 0.25
EMPTY_FOLDER_AREA = 9.0


class LayoutError(ValueError):
    pass


@dataclass
class _Entry:
    path: str
    name: str
    file: Optional[ScanFile] = None
    children: list[_Entry] = field(default_factory=list)
    area: float = 0.0
    file_count: int = 0
    size_bytes: int = 0
    lines: int = 0

    @property
    def is_file(self) -> bool:
        return self.file is not None

    @property
    def node_type(self) -> str:
        if self.file is not None:
            return "empty_file" if self.file.isEmpty else "file"
        return "folder" if self.file_count > 0 else "empty_folder"

    @property
    def height(self) -> float:
        kind = self.node_type
        if kind == "folder":
            return PLATFORM_HEIGHT
        if kind == "empty_folder":
            return 0.0
        if kind == "empty_file":
            return EMPTY_FILE_HEIGHT
        return min(MAX_BUILDING_HEIGHT, MIN_BUILDING_HEIGHT + HEIGHT_SQRT_SCALE * math.sqrt(self.lines))


def _split_path(path: str) -> list[str]:
    parts = path.split("/")
    if "\\" in path or len(parts) > MAX_DEPTH or any(p in ("", ".", "..") for p in parts):
        raise LayoutError(f"invalid path: {path!r}")
    return parts


def _count_lines(content: Optional[str]) -> int:
    if not content:
        return 0
    return content.count("\n") + (0 if content.endswith("\n") else 1)


def _build_tree(scan: ScanResult) -> _Entry:
    if len(scan.directories) + len(scan.files) > MAX_ENTRIES:
        raise LayoutError("too many entries")
    root = _Entry(path="", name=scan.rootName)
    folders: dict[str, _Entry] = {"": root}
    file_paths: set[str] = set()

    def ensure_folder(path: str) -> _Entry:
        if path in folders:
            return folders[path]
        if path in file_paths:
            raise LayoutError(f"path is both a file and a folder: {path!r}")
        parts = _split_path(path)
        parent = ensure_folder("/".join(parts[:-1]))
        entry = _Entry(path=path, name=parts[-1])
        parent.children.append(entry)
        folders[path] = entry
        return entry

    for directory in scan.directories:
        ensure_folder(directory)
    for file in scan.files:
        parts = _split_path(file.path)
        if file.path in file_paths or file.path in folders:
            raise LayoutError(f"duplicate or conflicting path: {file.path!r}")
        parent = ensure_folder("/".join(parts[:-1]))
        file_paths.add(file.path)
        entry = _Entry(path=file.path, name=parts[-1], file=file)
        parent.children.append(entry)
    return root


def _measure(entry: _Entry) -> None:
    if entry.file is not None:
        entry.file_count = 1
        entry.size_bytes = entry.file.size
        entry.lines = _count_lines(entry.file.content)
        entry.area = FILE_BASE_AREA + math.sqrt(entry.file.size) * FILE_SIZE_FACTOR
        return
    for child in entry.children:
        _measure(child)
    entry.file_count = sum(c.file_count for c in entry.children)
    entry.size_bytes = sum(c.size_bytes for c in entry.children)
    if not entry.children:
        entry.area = EMPTY_FOLDER_AREA
    else:
        inner = sum(c.area for c in entry.children)
        entry.area = (math.sqrt(inner) + 2 * PAD) ** 2


def _shrink(rect: Rect, amount: float) -> Rect:
    dx = min(amount, rect.w * 0.25)
    dz = min(amount, rect.h * 0.25)
    return Rect(rect.x + dx, rect.y + dz, rect.w - 2 * dx, rect.h - 2 * dz)


def _metrics(entry: _Entry) -> Metrics:
    depth = len(entry.path.split("/")) if entry.path else 0
    if entry.file is None:
        return Metrics(fileCount=entry.file_count, sizeBytes=entry.size_bytes, depth=depth)
    extension = extension_of(entry.name)
    return Metrics(
        sizeBytes=entry.size_bytes,
        lines=entry.lines,
        extension=extension,
        language=language_for(extension),
        depth=depth,
    )


def _place(entry: _Entry, rect: Rect, base_y: float, parent_id: Optional[str], out: list[Node]) -> None:
    node_id = ROOT_ID if parent_id is None else entry.path
    out.append(
        Node(
            id=node_id,
            path=entry.path,
            name=entry.name,
            type=entry.node_type,
            parentId=parent_id,
            dimensions=Dimensions(
                position=Position(x=rect.x, y=base_y, z=rect.y),
                width=rect.w,
                depth=rect.h,
                height=entry.height,
            ),
            metrics=_metrics(entry),
        )
    )
    if not entry.children:
        return
    ordered = sorted(entry.children, key=lambda c: (-c.area, c.name))
    tiles = squarify([c.area for c in ordered], _shrink(rect, PAD))
    for child, tile in zip(ordered, tiles):
        _place(child, _shrink(tile, (GAP if child.is_file else FOLDER_GAP) / 2), base_y + entry.height, node_id, out)


def build_city(scan: ScanResult) -> CityModel:
    root = _build_tree(scan)
    _measure(root)
    side = math.sqrt(root.area)
    nodes: list[Node] = []
    _place(root, Rect(0.0, 0.0, side, side), 0.0, None, nodes)
    return CityModel(rootId=ROOT_ID, nodes=nodes, edges=[], architecture=[])

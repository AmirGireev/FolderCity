# The scan format as a Pydantic model.
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Omitted = Literal["binary", "too_large"]


class ScanFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    size: int = Field(ge=0)
    content: Optional[str]
    omitted: Optional[Omitted]
    isEmpty: bool


class ScanResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"] = "1.0"
    rootName: str
    directories: list[str]
    emptyDirectories: list[str]
    files: list[ScanFile]
    truncated: bool

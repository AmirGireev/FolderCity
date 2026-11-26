"""Pydantic-Abbild des CityModel-Vertrags.

Quelle der Wahrheit ist ``schema/citymodel.schema.json``. Die Tests in
``tests/test_city_model.py`` prüfen, dass dieses Modell dazu passt.
Feldnamen sind bewusst camelCase, damit das JSON 1:1 dem Schema entspricht.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["folder", "file", "empty_folder", "empty_file"]
ArchitectureKind = Literal["api", "database", "external", "server"]
SourceKind = Literal["local", "github", "demo"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(_Strict):
    x: float
    y: float
    z: float


class Dimensions(_Strict):
    position: Position
    width: float = Field(ge=0)
    depth: float = Field(ge=0)
    height: float = Field(ge=0)


class Metrics(BaseModel):
    # Weitere numerische Metriken sind erlaubt (siehe Schema).
    model_config = ConfigDict(extra="allow")

    sizeBytes: Optional[int] = Field(default=None, ge=0)
    lines: Optional[int] = Field(default=None, ge=0)
    fileCount: Optional[int] = Field(default=None, ge=0)
    extension: Optional[str] = None
    language: Optional[str] = None


class Node(_Strict):
    id: str = Field(min_length=1)
    path: str
    name: str
    type: NodeType
    parentId: Optional[str]
    dimensions: Dimensions
    metrics: Metrics


class ImportEdge(_Strict):
    source: str
    target: str
    line: Optional[int] = Field(default=None, ge=1)


class ArchitectureNode(_Strict):
    id: str = Field(min_length=1)
    kind: ArchitectureKind
    label: str
    fileId: str
    line: int = Field(ge=1)


class Source(_Strict):
    kind: SourceKind
    name: str
    url: Optional[str] = None
    hash: Optional[str] = None


class CityModel(_Strict):
    schemaVersion: Literal["1.0"] = "1.0"
    source: Optional[Source] = None
    rootId: str
    nodes: list[Node]
    edges: list[ImportEdge]
    architecture: list[ArchitectureNode]

    def to_json_dict(self) -> dict[str, Union[str, list, dict]]:
        """JSON-Ausgabe ohne leere optionale Felder (passt zum Schema).

        ``parentId`` ist Pflicht und darf ``null`` sein, deshalb wird es nach
        ``exclude_none`` wiederhergestellt.
        """
        data = self.model_dump(mode="json", exclude_none=True)
        for node_dict, node in zip(data["nodes"], self.nodes):
            node_dict["parentId"] = node.parentId
        return data

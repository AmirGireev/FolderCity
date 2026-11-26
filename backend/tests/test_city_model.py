"""Prüft, dass Pydantic-Modell und JSON-Schema denselben Vertrag beschreiben."""

import copy
import json
from pathlib import Path
from typing import get_args

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.models import CityModel
from app.models.city_model import ArchitectureKind, NodeType

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "schema" / "citymodel.schema.json").read_text(encoding="utf-8"))
EXAMPLE = json.loads(
    (ROOT / "schema" / "examples" / "minimal.city.json").read_text(encoding="utf-8")
)
validator = Draft202012Validator(SCHEMA)


def test_schema_itself_is_valid():
    Draft202012Validator.check_schema(SCHEMA)


def test_example_matches_schema():
    validator.validate(EXAMPLE)


def test_example_parses_with_pydantic_and_roundtrips():
    model = CityModel.model_validate(EXAMPLE)
    out = model.to_json_dict()
    validator.validate(out)
    assert out == EXAMPLE


def test_example_covers_all_node_types_and_architecture_kinds():
    assert {n["type"] for n in EXAMPLE["nodes"]} == {"folder", "file", "empty_folder", "empty_file"}
    assert {a["kind"] for a in EXAMPLE["architecture"]} <= set(get_args(ArchitectureKind))


def test_enums_match_schema():
    assert set(get_args(NodeType)) == set(SCHEMA["$defs"]["NodeType"]["enum"])
    assert set(get_args(ArchitectureKind)) == set(SCHEMA["$defs"]["ArchitectureKind"]["enum"])


def test_required_fields_match_schema():
    from app.models.city_model import ArchitectureNode, Node

    def required(model):
        return {name for name, f in model.model_fields.items() if f.is_required()}

    # parentId ist in Pydantic Optional, aber Pflicht (darf null sein) – wie im Schema.
    assert required(Node) == set(SCHEMA["$defs"]["Node"]["required"])
    assert required(ArchitectureNode) == set(SCHEMA["$defs"]["ArchitectureNode"]["required"])


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["nodes"][0].update(type="building"),            # unbekannter Typ
        lambda d: d["nodes"][0]["dimensions"].update(width=-1),    # negative Breite
        lambda d: d["architecture"][0].update(kind="queue"),       # unbekannte Ebene
        lambda d: d["architecture"][0].update(line=0),             # Zeile < 1
        lambda d: d.update(unexpected=True),                       # unbekanntes Feld
        lambda d: d["nodes"][1].pop("dimensions"),                 # Pflichtfeld fehlt
    ],
)
def test_invalid_data_rejected_by_both(mutate):
    bad = copy.deepcopy(EXAMPLE)
    mutate(bad)
    assert not validator.is_valid(bad)
    with pytest.raises(ValidationError):
        CityModel.model_validate(bad)

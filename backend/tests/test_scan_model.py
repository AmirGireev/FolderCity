# Checks that the scan schema and Pydantic model match.
import copy

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from app.scan import ScanResult

from fixture_tree import EXPECTED, SCHEMA_DIR

import json

SCHEMA = json.loads((SCHEMA_DIR / "scan.schema.json").read_text(encoding="utf-8"))
validator = Draft202012Validator(SCHEMA)


def test_schema_valid_and_expected_matches():
    Draft202012Validator.check_schema(SCHEMA)
    validator.validate(EXPECTED)


def test_pydantic_roundtrip():
    assert ScanResult.model_validate(EXPECTED).model_dump(mode="json") == EXPECTED


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["files"][0].update(omitted="huge"),
        lambda d: d["files"][0].update(size=-1),
        lambda d: d["files"][0].pop("isEmpty"),
        lambda d: d.update(extra=1),
        lambda d: d.pop("truncated"),
    ],
)
def test_invalid_rejected_by_both(mutate):
    bad = copy.deepcopy(EXPECTED)
    mutate(bad)
    assert not validator.is_valid(bad)
    with pytest.raises(ValidationError):
        ScanResult.model_validate(bad)

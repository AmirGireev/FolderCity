"""Baut aus schema/examples/scan-fixture.json einen echten Ordner auf der Festplatte."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "schema"
FIXTURE = json.loads((SCHEMA_DIR / "examples" / "scan-fixture.json").read_text(encoding="utf-8"))
EXPECTED = json.loads((SCHEMA_DIR / "examples" / "scan.expected.json").read_text(encoding="utf-8"))
RULES = json.loads((SCHEMA_DIR / "scan-rules.json").read_text(encoding="utf-8"))


def write_tree(base: Path, tree: dict) -> None:
    base.mkdir(parents=True, exist_ok=True)
    for name, value in tree.items():
        target = base / name
        if isinstance(value, str):
            target.write_bytes(value.encode("utf-8"))
        elif "$bytes" in value:
            target.write_bytes(bytes(value["$bytes"]))
        else:
            write_tree(target, value)


def make_fixture(tmp_path: Path) -> Path:
    root = tmp_path / FIXTURE["name"]
    write_tree(root, FIXTURE["tree"])
    return root

# Checks that the analysis code never imports from the AI layer.
import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def imported_modules(path: Path) -> list[str]:
    modules = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            modules += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            modules.append("." * node.level + (node.module or ""))
            modules += ["." * node.level + (node.module or "") + "." + alias.name for alias in node.names]
    return modules


def test_analysis_never_imports_the_ai_layer():
    for path in (APP / "analysis").rglob("*.py"):
        for module in imported_modules(path):
            parts = module.replace("..", ".").split(".")
            assert "ai" not in parts, f"{path.name} imports {module}"


def test_analysis_is_found_by_the_check():
    assert any((APP / "analysis").rglob("*.py"))

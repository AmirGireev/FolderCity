# Tests cyclomatic complexity, circular imports and the blast radius.
import networkx as nx
import pytest

from app.analysis.graph import build_import_graph
from app.analysis.metrics import add_complexity, blast_radius, decision_lines, file_complexity, find_cycles
from app.analysis.symbols import extract_symbols
from app.scan.model import ScanFile


def scan_file(path: str, content: str) -> ScanFile:
    return ScanFile(path=path, size=len(content), content=content, omitted=None, isEmpty=not content.strip())


def complexity_of(path: str, code: str) -> dict[str, int | None]:
    symbols = add_complexity([scan_file(path, code)], extract_symbols(path, code))
    return {s.name: s.complexity for s in symbols}


PYTHON = """def f(a, b):
    if a and b:
        return 1
    elif a or b:
        return 2
    for x in range(3):
        while x:
            x -= 1
    try:
        pass
    except ValueError:
        pass
    return [i for i in a if i] if a else 0


def g():
    return 1
"""

TYPESCRIPT = """function f(a: number, b: number) {
  if (a && b) { return 1; } else if (a || b) { return 2; }
  for (let i = 0; i < 3; i++) {}
  while (a) { a--; }
  switch (a) { case 1: break; case 2: break; default: break; }
  try {} catch (e) {}
  return a ? 1 : b ?? 3;
}
const g = () => 1;
"""


def test_python_counts_every_branch_once():
    assert complexity_of("a.py", PYTHON) == {"f": 11, "g": 1}


def test_typescript_counts_cases_but_not_default():
    assert complexity_of("a.ts", TYPESCRIPT) == {"f": 12, "g": 1}


@pytest.mark.parametrize(
    ("path", "code", "name", "expected"),
    [
        ("A.cs", "class A {\n int F(int a, int b) {\n  if (a > 0 && b > 0) { return 1; }\n  foreach (var x in new int[0]) {}\n  switch (a) { case 1: break; case 2: break; default: break; }\n  try {} catch (Exception e) {}\n  return a > 0 ? 1 : 2;\n }\n}\n", "A.F", 8),
        ("A.java", "class A {\n int f(int a, int b) {\n  if (a > 0 || b > 0) { return 1; }\n  for (int x : new int[0]) {}\n  switch (a) { case 1: break; case 2: break; default: break; }\n  try {} catch (Exception e) {}\n  return a > 0 ? 1 : 2;\n }\n}\n", "A.f", 8),
        ("a.c", "int f(int a, int b) {\n if (a && b) { return 1; }\n for (int i = 0; i < 3; i++) {}\n while (a) { a--; }\n switch (a) { case 1: break; case 2: break; default: break; }\n return a ? 1 : 2;\n}\n", "f", 8),
        ("a.cpp", "int f(int a, int b) {\n if (a && b) { return 1; }\n for (auto x : v) {}\n try {} catch (...) {}\n return a ? 1 : 2;\n}\n", "f", 6),
    ],
)  # fmt: skip
def test_other_languages(path, code, name, expected):
    assert complexity_of(path, code)[name] == expected


def test_a_simple_function_has_complexity_one():
    assert complexity_of("a.py", "def f():\n    return 1\n") == {"f": 1}
    assert complexity_of("a.js", "function f() { return 1; }\n") == {"f": 1}


def test_wildcard_match_case_is_not_counted():
    code = "def f(x):\n    match x:\n        case 1:\n            return 1\n        case 2:\n            return 2\n        case _:\n            return 3\n"
    assert complexity_of("a.py", code) == {"f": 3}


def test_methods_get_their_own_value_and_classes_none():
    code = "class A:\n    def easy(self):\n        return 1\n\n    def hard(self, x):\n        if x:\n            return 1\n        return 2\n"
    assert complexity_of("a.py", code) == {"A": None, "A.easy": 1, "A.hard": 2}


def test_nested_functions_add_to_the_outer_function():
    code = "def outer(x):\n    def inner(y):\n        if y:\n            return 1\n        return 2\n    if x:\n        return inner(x)\n    return 0\n"
    assert complexity_of("a.py", code) == {"outer": 3}


def test_logical_operators_only_count_for_and_or():
    assert decision_lines("a.js", "const x = a + b;\nconst y = a && b;\nconst z = a ?? b;\nconst w = a | b;\n") == [2, 3]
    assert decision_lines("a.py", "x = a and b\ny = a + b\n") == [1]


def test_unknown_languages_and_empty_files_have_no_decisions():
    assert decision_lines("notes.txt", "if (x) {}") == []
    assert decision_lines("a.py", "") == []


def test_broken_code_does_not_crash():
    assert isinstance(complexity_of("a.py", "def f(:\n  if\n"), dict)


def test_file_complexity_is_the_highest_function():
    code = PYTHON
    symbols = add_complexity([scan_file("a.py", code)], extract_symbols("a.py", code))
    assert file_complexity(symbols) == {"a.py": 11}
    assert file_complexity([]) == {}


def graph_of(files: dict[str, str]) -> nx.DiGraph:
    return build_import_graph([scan_file(p, c) for p, c in files.items()])


def test_circular_imports_are_found_as_groups():
    graph = graph_of({
        "a.py": "import b\n", "b.py": "import c\n", "c.py": "import a\n",
        "x.py": "import y\n", "y.py": "import x\n",
        "free.py": "import a\n",
    })  # fmt: skip
    assert find_cycles(graph) == [["a.py", "b.py", "c.py"], ["x.py", "y.py"]]


def test_a_chain_without_a_loop_has_no_cycle():
    assert find_cycles(graph_of({"a.py": "import b\n", "b.py": "import c\n", "c.py": ""})) == []


def test_the_blast_radius_counts_direct_and_indirect_importers():
    graph = graph_of({"app.py": "import service\n", "service.py": "import db\n", "other.py": "import db\n", "db.py": ""})
    assert blast_radius(graph) == {"app.py": 0, "service.py": 1, "other.py": 0, "db.py": 3}


def test_the_blast_radius_handles_cycles():
    graph = graph_of({"a.py": "import b\n", "b.py": "import a\n", "c.py": "import a\n"})
    assert blast_radius(graph)["a.py"] == 2
    assert blast_radius(graph)["b.py"] == 2

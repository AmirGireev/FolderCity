# Tests that functions, classes and methods are found with correct line ranges.
import pytest

from app.analysis.symbols import extract_symbols

PYTHON = """import os

@decorator
def top(a):
    def inner():
        pass
    return inner


class Animal:
    legs = 4

    def speak(self):
        pass

    @staticmethod
    def create():
        pass

    class Tail:
        def wag(self):
            pass
"""

TYPESCRIPT = """import a from "./a";
export const arrow = (x: number) => x;
export function declared(): void {}
export default class Widget {
  render() {}
  static build() {}
}
const expr = function () {};
interface Ignored {}
function outer() {
  function innerHidden() {}
}
"""


def summary(path: str, content: str):
    return [(s.kind, s.name, s.startLine, s.endLine) for s in extract_symbols(path, content)]


def test_python_symbols_with_decorators_and_nesting():
    assert summary("a.py", PYTHON) == [
        ("function", "top", 3, 7),
        ("class", "Animal", 10, 22),
        ("method", "Animal.speak", 13, 14),
        ("method", "Animal.create", 16, 18),
        ("class", "Animal.Tail", 20, 22),
        ("method", "Animal.Tail.wag", 21, 22),
    ]


def test_python_nested_functions_are_not_listed():
    names = [s.name for s in extract_symbols("a.py", PYTHON)]
    assert "inner" not in names
    assert names[0] == "top"


def test_python_line_ranges_start_at_decorators():
    symbols = {s.name: s for s in extract_symbols("a.py", PYTHON)}
    assert (symbols["top"].startLine, symbols["top"].endLine) == (3, 7)
    assert symbols["Animal.create"].startLine == 16
    assert symbols["Animal"].kind == "class"
    assert symbols["Animal.speak"].kind == "method"
    assert symbols["Animal.Tail.wag"].kind == "method"


@pytest.mark.parametrize("path", ["a.ts", "a.tsx", "a.js", "a.jsx", "a.mjs"])
def test_javascript_family_symbols(path):
    symbols = {s.name: s for s in extract_symbols(path, TYPESCRIPT.replace("interface Ignored {}", ""))}
    assert symbols["arrow"].kind == "function"
    assert symbols["declared"].kind == "function"
    assert symbols["Widget"].kind == "class"
    assert symbols["Widget.render"].kind == "method"
    assert symbols["Widget.build"].kind == "method"
    assert symbols["expr"].kind == "function"
    assert symbols["outer"].kind == "function"
    assert "innerHidden" not in symbols


def test_typescript_ignores_interfaces_and_reads_abstract_classes():
    code = "interface I {}\nexport abstract class Base { run(): void {} }\n"
    assert [(s.kind, s.name) for s in extract_symbols("a.ts", code)] == [("class", "Base"), ("method", "Base.run")]


def test_exported_declarations_start_at_the_export_keyword():
    symbols = {s.name: s for s in extract_symbols("a.ts", TYPESCRIPT)}
    assert symbols["declared"].startLine == 3
    assert (symbols["Widget"].startLine, symbols["Widget"].endLine) == (4, 7)


def test_unknown_languages_and_empty_files_give_nothing():
    assert extract_symbols("notes.txt", "def x(): pass") == []
    assert extract_symbols("empty.py", "") == []


def test_broken_code_does_not_crash():
    assert isinstance(extract_symbols("a.py", "def (:\nclass\n  ???"), list)


def test_byte_order_mark_is_ignored():
    assert [s.name for s in extract_symbols("a.py", "﻿def f():\n    pass\n")] == ["f"]


def test_symbol_ids_are_unique_and_include_file_and_line():
    symbols = extract_symbols("src/a.py", PYTHON)
    assert len({s.id for s in symbols}) == len(symbols)
    assert symbols[0].id == "src/a.py#top@3"
    assert all(s.fileId == "src/a.py" for s in symbols)

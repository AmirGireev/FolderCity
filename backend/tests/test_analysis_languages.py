# Tests symbols, imports and import resolution for C#, Java, C and C++.
import pytest

from app.analysis.graph import build_import_graph, graph_to_edges
from app.analysis.import_refs import extract_import_refs, extract_namespaces
from app.analysis.parsing import language_of
from app.analysis.symbols import extract_symbols
from app.scan.model import ScanFile


def symbols(path: str, code: str):
    return [(s.kind, s.name, s.startLine, s.endLine) for s in extract_symbols(path, code)]


def edges(files: dict[str, str]) -> set[tuple[str, str]]:
    scan = [ScanFile(path=p, size=len(c), content=c, omitted=None, isEmpty=not c.strip()) for p, c in files.items()]
    return {(e.source, e.target) for e in graph_to_edges(build_import_graph(scan))}


@pytest.mark.parametrize(
    ("path", "language"),
    [
        ("A.cs", "csharp"), ("A.java", "java"), ("a.c", "c"), ("a.h", "cpp"), ("a.cpp", "cpp"), ("a.hpp", "cpp"),
        ("a.cc", "cpp"), ("lib.rs", None), ("main.go", None), ("index.php", None), ("app.rb", None),
        ("a.py", "python"), ("a.tsx", "tsx"), ("README.md", None), ("Makefile", None),
    ],
)  # fmt: skip
def test_language_detection(path, language):
    assert language_of(path) == language


CSHARP = """using System;
using Game.Core;

namespace Game.Player
{
    public class PlayerController : MonoBehaviour
    {
        public PlayerController() { }

        void Start()
        {
        }

        int Speed { get; set; }
    }

    public interface IMove { void Go(); }
    struct Point { }
}
"""


def test_csharp_symbols():
    assert symbols("P.cs", CSHARP) == [
        ("class", "PlayerController", 6, 15),
        ("method", "PlayerController.PlayerController", 8, 8),
        ("method", "PlayerController.Start", 10, 12),
        ("class", "IMove", 17, 17),
        ("method", "IMove.Go", 17, 17),
        ("class", "Point", 18, 18),
    ]


def test_csharp_file_scoped_namespace_and_records():
    code = "namespace Shop.Items;\n\npublic record Item(int Id);\n\npublic class Cart\n{\n    public void Add() { }\n}\n"
    assert [(k, n) for k, n, *_ in symbols("C.cs", code)] == [("class", "Item"), ("class", "Cart"), ("method", "Cart.Add")]


def test_csharp_usings_and_namespaces():
    refs = extract_import_refs("P.cs", "using System;\nusing static Game.Util;\nusing F = Bar.Baz;\nnamespace N { using Inner.Ns; }\n")
    assert [(r.module, r.line) for r in refs] == [("System", 1), ("Game.Util", 2), ("Bar.Baz", 3), ("Inner.Ns", 4)]
    assert extract_namespaces("P.cs", CSHARP) == ["Game.Player"]
    assert extract_namespaces("P.cs", "namespace A { namespace B { class X {} } }") == ["A", "A.B"]


def test_csharp_using_links_files_of_the_namespace():
    files = {
        "Player.cs": "using Game.Core;\nnamespace Game.Player { class P {} }\n",
        "Core/Health.cs": "namespace Game.Core { class Health {} }\n",
        "Core/Mana.cs": "namespace Game.Core { class Mana {} }\n",
        "Other.cs": "namespace Unrelated { class O {} }\n",
    }
    assert edges(files) == {("Player.cs", "Core/Health.cs"), ("Player.cs", "Core/Mana.cs")}


def test_csharp_namespaces_with_too_many_files_are_not_linked():
    files = {f"Big/F{i}.cs": "namespace Big { class C {} }\n" for i in range(30)}
    files["User.cs"] = "using Big;\nclass U {}\n"
    assert edges(files) == set()


JAVA = """package a.b;

import java.util.List;
import a.c.D;
import static a.c.E.helper;
import a.f.*;

public class Account {
    public Account() { }

    public void deposit(int x) { }

    enum Kind { A, B }
}

interface Shape { double area(); }
record Point(int x, int y) { }
"""


def test_java_symbols():
    assert symbols("Account.java", JAVA) == [
        ("class", "Account", 8, 14),
        ("method", "Account.Account", 9, 9),
        ("method", "Account.deposit", 11, 11),
        ("class", "Account.Kind", 13, 13),
        ("class", "Shape", 16, 16),
        ("method", "Shape.area", 16, 16),
        ("class", "Point", 17, 17),
    ]


def test_java_imports():
    refs = extract_import_refs("Account.java", JAVA)
    assert [(r.module, r.names, r.kind) for r in refs] == [
        ("java.util.List", (), ""), ("a.c.D", (), ""), ("a.c.E.helper", (), "static"), ("a.f", ("*",), ""),
    ]  # fmt: skip
    assert extract_namespaces("Account.java", JAVA) == ["a.b"]


def test_java_imports_link_classes_static_members_and_packages():
    files = {
        "src/a/b/Account.java": JAVA,
        "src/a/c/D.java": "package a.c;\nclass D {}\n",
        "src/a/c/E.java": "package a.c;\nclass E {}\n",
        "src/a/f/One.java": "package a.f;\nclass One {}\n",
        "src/a/f/Two.java": "package a.f;\nclass Two {}\n",
    }
    assert edges(files) == {
        ("src/a/b/Account.java", "src/a/c/D.java"),
        ("src/a/b/Account.java", "src/a/c/E.java"),
        ("src/a/b/Account.java", "src/a/f/One.java"),
        ("src/a/b/Account.java", "src/a/f/Two.java"),
    }


C_CODE = """#include <stdio.h>
#include "util/math.h"

struct Point { int x; };

static int *make(int n)
{
    return 0;
}

int main(void) { return 0; }
"""


def test_c_symbols_and_includes():
    assert symbols("main.c", C_CODE) == [("class", "Point", 4, 4), ("function", "make", 6, 9), ("function", "main", 11, 11)]
    assert [(r.module, r.kind) for r in extract_import_refs("main.c", C_CODE)] == [("stdio.h", "system"), ("util/math.h", "local")]


CPP_CODE = """#include "shape.hpp"

namespace geo {

class Circle : public Shape {
public:
    void draw() { }
    Circle();
    ~Circle() { }
};

template <typename T>
T twice(T a) { return a + a; }

}

void geo::Circle::scale() { }

struct Box { int volume() const { return 1; } };
"""


def test_cpp_symbols():
    assert symbols("a.cpp", CPP_CODE) == [
        ("class", "Circle", 5, 10),
        ("method", "Circle.draw", 7, 7),
        ("method", "Circle.~Circle", 9, 9),
        ("function", "twice", 13, 13),
        ("method", "geo.Circle.scale", 17, 17),
        ("class", "Box", 19, 19),
        ("method", "Box.volume", 19, 19),
    ]


def test_c_family_includes_resolve_relative_and_by_suffix():
    files = {
        "src/main.cpp": '#include "util.hpp"\n#include "core/shape.hpp"\n#include <vector>\n',
        "src/util.hpp": "",
        "include/core/shape.hpp": "",
        "other/vector": "",
    }
    assert edges(files) == {("src/main.cpp", "src/util.hpp"), ("src/main.cpp", "include/core/shape.hpp")}


@pytest.mark.parametrize(
    "path",
    ["a.cs", "a.java", "a.c", "a.cpp"],
)
def test_empty_and_broken_files_do_not_crash(path):
    assert extract_symbols(path, "") == []
    assert isinstance(extract_symbols(path, "}{ ((( class\n  ???  \n"), list)
    assert isinstance(extract_import_refs(path, "}{ ((( import\n"), list)

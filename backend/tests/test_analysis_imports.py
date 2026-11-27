# Tests import detection, import resolution and the import graph.
from pathlib import Path

import networkx as nx

from app.analysis import analyze
from app.analysis.graph import build_import_graph, graph_to_edges
from app.analysis.import_refs import ImportRef, extract_import_refs
from app.analysis.resolve import Resolver
from app.scan.model import ScanFile, ScanResult
from app.scan.walker import scan_directory


def scan_files(files: dict[str, str | None]) -> list[ScanFile]:
    return [
        ScanFile(path=p, size=len(c or ""), content=c, omitted=None if c is not None else "binary", isEmpty=not (c or "").strip())
        for p, c in files.items()
    ]


def edges(files: dict[str, str | None]) -> set[tuple[str, str]]:
    return {(e.source, e.target) for e in graph_to_edges(build_import_graph(scan_files(files)))}


def test_python_import_forms_are_detected_with_lines():
    code = "import os, sys as s\nfrom .models import X as Y, Z\nfrom .. import pkg\nfrom a.b import c\n\ndef f():\n    import lazy\n"
    assert extract_import_refs("m.py", code) == [
        ImportRef("os", 1), ImportRef("sys", 1),
        ImportRef("models", 2, 1, ("X", "Z")),
        ImportRef("", 3, 2, ("pkg",)),
        ImportRef("a.b", 4, 0, ("c",)),
        ImportRef("lazy", 7),
    ]  # fmt: skip


def test_javascript_import_forms_are_detected():
    code = (
        'import a from "./a";\nimport "./side";\nexport * from "./re";\n'
        'const r = require("./req");\nasync function f() { return import("./dyn"); }\nimport x from "react";\n'
    )
    modules = [(r.module, r.line) for r in extract_import_refs("m.ts", code)]
    assert modules == [("./a", 1), ("./side", 2), ("./re", 3), ("./req", 4), ("./dyn", 5), ("react", 6)]


def test_python_absolute_and_relative_imports_are_resolved():
    files = {
        "pkg/__init__.py": "",
        "pkg/a.py": "from .b import x\nfrom . import c\nfrom pkg.d import y\nimport pkg.sub.e\n",
        "pkg/b.py": "x = 1\n",
        "pkg/c.py": "z = 1\n",
        "pkg/d.py": "y = 1\n",
        "pkg/sub/__init__.py": "",
        "pkg/sub/e.py": "from .. import b\nfrom ..d import y\n",
    }
    result = edges(files)
    assert {("pkg/a.py", "pkg/b.py"), ("pkg/a.py", "pkg/c.py"), ("pkg/a.py", "pkg/d.py"), ("pkg/a.py", "pkg/sub/e.py")} <= result
    assert ("pkg/sub/e.py", "pkg/b.py") in result
    assert ("pkg/sub/e.py", "pkg/d.py") in result


def test_python_imports_below_a_source_root_are_resolved_by_suffix():
    files = {
        "backend/app/main.py": "from app.models import City\nfrom app.scan.rules import MAX\n",
        "backend/app/models/__init__.py": "City = 1\n",
        "backend/app/scan/rules.py": "MAX = 1\n",
    }
    assert edges(files) == {
        ("backend/app/main.py", "backend/app/models/__init__.py"),
        ("backend/app/main.py", "backend/app/scan/rules.py"),
    }


def test_from_package_import_module_links_the_module():
    files = {"app/__init__.py": "", "app/x.py": "from app import util\n", "app/util.py": "A = 1\n"}
    assert ("app/x.py", "app/util.py") in edges(files)


def test_external_packages_are_ignored():
    files = {"a.py": "import os\nimport requests\nfrom fastapi import FastAPI\n", "b.ts": 'import React from "react";\nimport fs from "node:fs";\n'}
    assert edges(files) == set()


def test_javascript_relative_imports_find_extensions_and_index_files():
    files = {
        "src/app.ts": 'import a from "./a";\nimport b from "./lib";\nimport c from "../util/c.js";\nimport d from "./data.json";\n',
        "src/a.tsx": "",
        "src/lib/index.ts": "",
        "util/c.ts": "",
        "src/data.json": "{}",
    }
    assert edges(files) == {
        ("src/app.ts", "src/a.tsx"),
        ("src/app.ts", "src/lib/index.ts"),
        ("src/app.ts", "util/c.ts"),
        ("src/app.ts", "src/data.json"),
    }


def test_javascript_alias_imports_resolve_to_the_nearest_source_folder():
    files = {
        "web/app/page.tsx": 'import { X } from "@/components/x";\nimport { Y } from "@/y";\n',
        "web/src/components/x.tsx": "",
        "web/y.ts": "",
    }
    assert edges(files) == {("web/app/page.tsx", "web/src/components/x.tsx"), ("web/app/page.tsx", "web/y.ts")}


def test_imports_outside_the_project_and_self_imports_are_dropped():
    files = {"a.py": "from .. import x\nimport a\n", "b.ts": 'import z from "../../z";\n'}
    assert edges(files) == set()


def test_edges_keep_the_line_of_the_first_import_and_have_no_duplicates():
    files = {"a.py": "x = 1\nimport b\nimport b\n", "b.py": ""}
    result = graph_to_edges(build_import_graph(scan_files(files)))
    assert [(e.source, e.target, e.line) for e in result] == [("a.py", "b.py", 2)]


def test_graph_is_a_networkx_digraph_with_all_files_as_nodes():
    graph = build_import_graph(scan_files({"a.py": "import b\n", "b.py": "", "c.py": "", "logo.png": None}))
    assert isinstance(graph, nx.DiGraph)
    assert set(graph.nodes) == {"a.py", "b.py", "c.py", "logo.png"}
    assert list(graph.successors("a.py")) == ["b.py"]


def test_resolver_returns_nothing_for_unknown_languages():
    assert Resolver(["a.txt"]).resolve("a.txt", ImportRef("b", 1)) == []


def test_analyze_gives_symbols_and_edges_sorted_by_file():
    scan = ScanResult(
        rootName="p", directories=[], emptyDirectories=[], truncated=False,
        files=scan_files({"b.py": "def b(): pass\n", "a.py": "import b\ndef a(): pass\n"}),
    )  # fmt: skip
    result = analyze(scan)
    assert [s.id for s in result.symbols] == ["a.py#a@2", "b.py#b@1"]
    assert [(e.source, e.target) for e in result.edges] == [("a.py", "b.py")]


def test_analysis_of_this_projects_own_backend():
    app_dir = Path(__file__).resolve().parents[1] / "app"
    scan = scan_directory(app_dir)
    found = {(e.source, e.target) for e in analyze(scan).edges}
    assert ("main.py", "pipeline.py") in found
    assert ("pipeline.py", "analysis/__init__.py") in found
    assert ("analysis/__init__.py", "analysis/graph.py") in found
    assert ("analysis/graph.py", "analysis/resolve.py") in found
    assert ("layout/__init__.py", "layout/city.py") in found

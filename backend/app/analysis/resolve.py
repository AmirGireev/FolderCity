# Resolves import names to files of the project; external packages resolve to nothing.
from __future__ import annotations

import posixpath
from typing import Iterable, Optional

from .import_refs import ImportRef
from .parsing import JAVASCRIPT_FAMILY, language_of

JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json")
JS_ALIAS_PREFIXES = ("@/", "~/")
JS_RUNTIME_SWAPS = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}
MAX_GROUP_FILES = 25


def _dir_of(path: str) -> str:
    return posixpath.dirname(path)


def _common_prefix_length(a: str, b: str) -> int:
    count = 0
    for left, right in zip(_dir_of(a).split("/"), _dir_of(b).split("/")):
        if left != right:
            break
        count += 1
    return count


def _closest(matches: list[str], importer: str) -> Optional[str]:
    if not matches:
        return None
    return max(matches, key=lambda p: (_common_prefix_length(p, importer), -len(p), p))


class Resolver:
    def __init__(self, paths: Iterable[str], namespaces: Optional[dict[str, list[str]]] = None) -> None:
        self.paths = set(paths)
        self.namespaces = namespaces or {}
        self._dotted: dict[str, dict[str, list[str]]] = {
            "python": self._dotted_index(".py", drop_init=True),
            "java": self._dotted_index(".java", drop_init=False),
        }
        self._by_name: dict[str, list[str]] = {}
        for path in sorted(self.paths):
            self._by_name.setdefault(posixpath.basename(path), []).append(path)

    def _dotted_index(self, extension: str, drop_init: bool) -> dict[str, list[str]]:
        index: dict[str, list[str]] = {}
        for path in sorted(self.paths):
            if not path.endswith(extension):
                continue
            parts = path[: -len(extension)].split("/")
            if drop_init and parts[-1] == "__init__":
                parts = parts[:-1]
            for start in range(len(parts)):
                dotted = ".".join(parts[start:])
                if dotted:
                    index.setdefault(dotted, []).append(path)
        return index

    def resolve(self, importer: str, ref: ImportRef) -> list[str]:
        language = language_of(importer)
        if language == "python":
            found = self._resolve_python(importer, ref)
        elif language in JAVASCRIPT_FAMILY:
            found = self._resolve_javascript(importer, ref.module)
        elif language == "csharp":
            found = self._resolve_namespace(importer, ref.module, "csharp", try_parent=True)
        elif language == "java":
            found = self._resolve_java(importer, ref)
        elif language in ("c", "cpp"):
            found = self._resolve_include(importer, ref)
        else:
            found = []
        return [path for path in dict.fromkeys(found) if path != importer]

    def _suffix_match(self, relative: str, importer: str) -> Optional[str]:
        relative = relative.lstrip("/")
        if not relative:
            return None
        candidates = self._by_name.get(posixpath.basename(relative), [])
        return _closest([p for p in candidates if p == relative or p.endswith("/" + relative)], importer)

    def _dotted_lookup(self, kind: str, dotted: str, importer: str) -> Optional[str]:
        return _closest(self._dotted[kind].get(dotted, []), importer)

    def _resolve_python(self, importer: str, ref: ImportRef) -> list[str]:
        main: Optional[str] = None
        subs: list[str] = []
        if ref.level > 0:
            base = _dir_of(importer)
            for _ in range(ref.level - 1):
                base = _dir_of(base)
            if ref.module:
                main = self._python_relative(base, ref.module)
            elif posixpath.join(base, "__init__.py") in self.paths:
                main = posixpath.join(base, "__init__.py")
            for name in ref.names:
                sub = self._python_relative(base, f"{ref.module}.{name}" if ref.module else name)
                if sub:
                    subs.append(sub)
        else:
            main = self._dotted_lookup("python", ref.module, importer)
            for name in ref.names:
                sub = self._dotted_lookup("python", f"{ref.module}.{name}", importer)
                if sub:
                    subs.append(sub)
        only_submodules = bool(ref.names) and len(subs) == len(ref.names)
        if main and main.endswith("__init__.py") and only_submodules:
            main = None
        return ([main] if main else []) + subs

    def _python_relative(self, base: str, dotted: str) -> Optional[str]:
        target = posixpath.normpath(posixpath.join(base, *dotted.split(".")))
        if target.startswith(".."):
            return None
        for candidate in (f"{target}.py", f"{target}/__init__.py"):
            if candidate in self.paths:
                return candidate
        return None

    def _javascript_lookup(self, target: str) -> Optional[str]:
        target = posixpath.normpath(target)
        if target.startswith(".."):
            return None
        dot = target.rfind(".")
        extension = target[dot:] if dot > target.rfind("/") + 1 else ""
        candidates = [target]
        for swap in JS_RUNTIME_SWAPS.get(extension, ()):
            candidates.append(target[: -len(extension)] + swap)
        candidates += [target + ext for ext in JS_EXTENSIONS]
        candidates += [f"{target}/index{ext}" for ext in JS_EXTENSIONS]
        return next((c for c in candidates if c in self.paths), None)

    def _resolve_javascript(self, importer: str, module: str) -> list[str]:
        if module.startswith("."):
            found = self._javascript_lookup(posixpath.join(_dir_of(importer), module))
            return [found] if found else []
        if module.startswith(JS_ALIAS_PREFIXES):
            rest = module[2:]
            base = _dir_of(importer)
            while True:
                for root in (posixpath.join(base, "src"), base):
                    found = self._javascript_lookup(posixpath.join(root, rest))
                    if found:
                        return [found]
                if not base:
                    return []
                base = _dir_of(base)
        return []

    def _resolve_namespace(self, importer: str, namespace: str, language: str, try_parent: bool) -> list[str]:
        names = [namespace]
        if try_parent and "." in namespace:
            names.append(namespace.rsplit(".", 1)[0])
        for name in names:
            files = [p for p in self.namespaces.get(name, []) if language_of(p) == language]
            if files:
                return files if len(files) <= MAX_GROUP_FILES else []
        return []

    def _resolve_java(self, importer: str, ref: ImportRef) -> list[str]:
        if "*" in ref.names:
            return self._resolve_namespace(importer, ref.module, "java", try_parent=False)
        names = [ref.module]
        if "." in ref.module:
            names.append(ref.module.rsplit(".", 1)[0])
        for name in names:
            found = self._dotted_lookup("java", name, importer)
            if found:
                return [found]
        return []

    def _resolve_include(self, importer: str, ref: ImportRef) -> list[str]:
        include = ref.module
        if ref.kind == "system" and "/" not in include:
            return []
        direct = posixpath.normpath(posixpath.join(_dir_of(importer), include))
        if direct in self.paths:
            return [direct]
        found = self._suffix_match(include, importer)
        return [found] if found else []

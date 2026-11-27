# Resolves import names to files of the project; external packages resolve to nothing.
from __future__ import annotations

import posixpath
from typing import Iterable, Optional

from .import_refs import ImportRef
from .parsing import language_of

JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json")
JS_ALIAS_PREFIXES = ("@/", "~/")
JS_RUNTIME_SWAPS = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}


def _dir_of(path: str) -> str:
    return posixpath.dirname(path)


def _common_prefix_length(a: str, b: str) -> int:
    count = 0
    for left, right in zip(_dir_of(a).split("/"), _dir_of(b).split("/")):
        if left != right:
            break
        count += 1
    return count


class Resolver:
    def __init__(self, paths: Iterable[str]) -> None:
        self.paths = set(paths)
        self._python_modules: dict[str, list[str]] = {}
        for path in sorted(self.paths):
            if language_of(path) != "python":
                continue
            stem = path[:-3]
            parts = stem.split("/")
            if parts[-1] == "__init__":
                parts = parts[:-1]
            for start in range(len(parts)):
                dotted = ".".join(parts[start:])
                if dotted:
                    self._python_modules.setdefault(dotted, []).append(path)

    def resolve(self, importer: str, ref: ImportRef) -> list[str]:
        language = language_of(importer)
        if language == "python":
            found = self._resolve_python(importer, ref)
        elif language in ("javascript", "typescript", "tsx"):
            found = self._resolve_javascript(importer, ref.module)
        else:
            found = []
        return [path for path in dict.fromkeys(found) if path != importer]

    def _python_candidates(self, dotted: str, importer: str) -> Optional[str]:
        matches = self._python_modules.get(dotted)
        if not matches:
            return None
        return max(matches, key=lambda p: (_common_prefix_length(p, importer), -len(p), p))

    def _python_relative(self, base: str, dotted: str) -> Optional[str]:
        target = posixpath.normpath(posixpath.join(base, *dotted.split(".")))
        for candidate in (f"{target}.py", f"{target}/__init__.py"):
            if candidate in self.paths:
                return candidate
        return None

    def _resolve_python(self, importer: str, ref: ImportRef) -> list[str]:
        results: list[str] = []
        if ref.level > 0:
            base = _dir_of(importer)
            for _ in range(ref.level - 1):
                base = _dir_of(base)
            if ref.module:
                main = self._python_relative(base, ref.module)
                if main:
                    results.append(main)
            elif posixpath.join(base, "__init__.py") in self.paths:
                results.append(posixpath.join(base, "__init__.py"))
            for name in ref.names:
                sub = self._python_relative(base, f"{ref.module}.{name}" if ref.module else name)
                if sub:
                    results.append(sub)
            return results
        main = self._python_candidates(ref.module, importer)
        if main:
            results.append(main)
        for name in ref.names:
            sub = self._python_candidates(f"{ref.module}.{name}", importer)
            if sub:
                results.append(sub)
        return results

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

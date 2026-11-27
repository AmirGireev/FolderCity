# Rules that find API routes: Python decorators, Express calls and Next.js route files.
from __future__ import annotations

import re

from .rules import JAVASCRIPT, PYTHON, Finding, Rule, line_of

PY_ROUTE = re.compile(
    r"""^[ \t]*@[ \t]*[A-Za-z_][\w.]*\.(get|post|put|delete|patch|head|options|route|websocket|api_route)\(\s*[rbuf]*(["'])(/[^"']*)\2([^\n]*(?:\n[^\n]*){0,2})""",
    re.MULTILINE,
)
PY_METHODS = re.compile(r"methods\s*=\s*[\[(]([^\])]*)[\])]")
EXPRESS_ROUTE = re.compile(
    r"""\b([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|all|head|options)\(\s*(["'`])(/[^"'`]*)\3"""
)
EXPRESS_OBJECT = re.compile(r"app|router|route|server|api", re.IGNORECASE)
NEXT_APP_ROUTE = re.compile(r"(?:^|/)app/api(?:/(.*))?/route\.(?:ts|tsx|js|jsx|mjs)$")
NEXT_PAGES_ROUTE = re.compile(r"(?:^|/)pages/api/(.*)\.(?:ts|tsx|js|jsx|mjs)$")
NEXT_EXPORT = re.compile(
    r"^export\s+(?:async\s+)?(?:function\s+|const\s+|let\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", re.MULTILINE
)


def python_routes(path: str, content: str) -> list[Finding]:
    findings = []
    for match in PY_ROUTE.finditer(content):
        verb, route = match.group(1), match.group(3)
        if verb == "route":
            found = PY_METHODS.search(match.group(4))
            methods = ",".join(m.strip(" \"'").upper() for m in found.group(1).split(",") if m.strip()) if found else "GET"
        elif verb in ("api_route",):
            methods = "ANY"
        elif verb == "websocket":
            methods = "WS"
        else:
            methods = verb.upper()
        findings.append(Finding("api", f"{methods} {route}", line_of(content, match.start())))
    return findings


def express_routes(path: str, content: str) -> list[Finding]:
    findings = []
    for match in EXPRESS_ROUTE.finditer(content):
        if not EXPRESS_OBJECT.search(match.group(1)):
            continue
        verb = "ANY" if match.group(2) == "all" else match.group(2).upper()
        findings.append(Finding("api", f"{verb} {match.group(4)}", line_of(content, match.start())))
    return findings


def _next_url(parts: str) -> str:
    segments = [s for s in parts.split("/") if s and not (s.startswith("(") and s.endswith(")"))]
    return "/".join(["/api", *segments]) if segments else "/api"


def nextjs_routes(path: str, content: str) -> list[Finding]:
    app = NEXT_APP_ROUTE.search(path)
    if app:
        url = _next_url(app.group(1) or "")
        methods = [(m.group(1), line_of(content, m.start())) for m in NEXT_EXPORT.finditer(content)]
        return [Finding("api", f"{method} {url}", line) for method, line in methods] or [Finding("api", f"ANY {url}", 1)]
    pages = NEXT_PAGES_ROUTE.search(path)
    if pages:
        name = pages.group(1)
        name = name[: -len("index")].rstrip("/") if name == "index" or name.endswith("/index") else name
        return [Finding("api", f"ANY {_next_url(name)}", 1)]
    return []


RULES = [
    Rule("python-routes", PYTHON, python_routes),
    Rule("express-routes", JAVASCRIPT, express_routes),
    Rule("nextjs-routes", JAVASCRIPT, nextjs_routes),
]

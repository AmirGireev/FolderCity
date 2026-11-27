# Rules that find calls to external HTTP APIs: requests, httpx, aiohttp, fetch and axios.
from __future__ import annotations

import re

from .rules import JAVASCRIPT, PYTHON, Finding, Rule, line_of

PY_CALL = re.compile(
    r"""\b(requests|httpx)\.(?:get|post|put|delete|patch|head|options|request|stream)\(\s*(f?)(?:(["'])(https?://[^/"'\s?{]+)?|)"""
)
PY_CLIENT = re.compile(r"\b(httpx\.(?:Async)?Client|aiohttp\.ClientSession|requests\.Session)\(")
JS_FETCH = re.compile(r"""\bfetch\(\s*(?:(["'`])(\s*[^"'`\n]*)|)""")
JS_AXIOS = re.compile(r"""\baxios(?:\.(?:get|post|put|delete|patch|head|options|request))?\(\s*(?:(["'`])([^"'`\n]*)|)""")
ABSOLUTE_URL = re.compile(r"^https?://([^/\s?:#]+(?::\d+)?)")


def python_http(path: str, content: str) -> list[Finding]:
    findings = []
    for match in PY_CALL.finditer(content):
        host = match.group(4)
        label = f"{match.group(1)}: {host.split('://', 1)[1]}" if host else f"{match.group(1)}: dynamic URL"
        findings.append(Finding("external", label, line_of(content, match.start())))
    for match in PY_CLIENT.finditer(content):
        findings.append(Finding("external", f"{match.group(1)} client", line_of(content, match.start())))
    return findings


def _js_label(library: str, quote: str | None, text: str | None) -> str | None:
    if quote is None:
        return f"{library}: dynamic URL"
    absolute = ABSOLUTE_URL.match((text or "").strip())
    if absolute:
        return f"{library}: {absolute.group(1)}"
    if (text or "").lstrip().startswith("/") or (text or "").lstrip().startswith("."):
        return None
    return f"{library}: dynamic URL"


def javascript_http(path: str, content: str) -> list[Finding]:
    findings = []
    for library, pattern in (("fetch", JS_FETCH), ("axios", JS_AXIOS)):
        for match in pattern.finditer(content):
            label = _js_label(library, match.group(1), match.group(2))
            if label:
                findings.append(Finding("external", label, line_of(content, match.start())))
    return findings


RULES = [
    Rule("python-http", PYTHON, python_http),
    Rule("javascript-http", JAVASCRIPT, javascript_http),
]

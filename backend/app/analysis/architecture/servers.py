# Rules that find servers and containers: Dockerfile, Compose, Render, Procfile and .env.example (names only).
from __future__ import annotations

import re

from ...scan.rules import ENV_NAME, ENV_TEMPLATES
from .rules import Finding, Rule, basename

DOCKER_FROM = re.compile(r"^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)", re.IGNORECASE | re.MULTILINE)
DOCKER_EXPOSE = re.compile(r"^\s*EXPOSE\s+(.+)$", re.IGNORECASE | re.MULTILINE)
COMPOSE_NAMES = ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml")
YAML_KEY = re.compile(r"^(\s*)([A-Za-z0-9_.-]+):\s*(.*?)\s*$")
YAML_ITEM = re.compile(r"^(\s*)-\s+(.*?)\s*$")
PROCFILE_LINE = re.compile(r"^([A-Za-z0-9_-]+):\s*(\S.*)$")
MAX_ENV_NAMES = 6


def _is_dockerfile(path: str) -> bool:
    name = basename(path).lower()
    return name == "dockerfile" or name.startswith("dockerfile.") or name.endswith(".dockerfile")


def _is_compose(path: str) -> bool:
    name = basename(path).lower()
    return name in COMPOSE_NAMES or (name.startswith("docker-compose.") and name.endswith((".yml", ".yaml")))


def _is_render(path: str) -> bool:
    return basename(path).lower() in ("render.yaml", "render.yml")


def _line_number(content: str, index: int) -> int:
    return content.count("\n", 0, index) + 1


def dockerfile(path: str, content: str) -> list[Finding]:
    images = list(DOCKER_FROM.finditer(content))
    if not images:
        return []
    ports: list[str] = []
    for match in DOCKER_EXPOSE.finditer(content):
        ports += [p.split("/")[0] for p in match.group(1).split() if p.split("/")[0].isdigit()]
    label = f"Dockerfile: {images[-1].group(1)}"
    if ports:
        label += f" (port {', '.join(dict.fromkeys(ports))})"
    return [Finding("server", label, _line_number(content, images[0].start()))]


def _indent(text: str) -> int:
    return len(text.replace("\t", "    "))


def compose_services(path: str, content: str) -> list[Finding]:
    lines = content.splitlines()
    start = next((i for i, line in enumerate(lines) if re.match(r"^services:\s*(#.*)?$", line)), None)
    if start is None:
        return []
    service_indent = None
    services: list[dict] = []
    ports_indent = None
    for number in range(start + 1, len(lines)):
        line = lines[number]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            break
        key = YAML_KEY.match(line)
        indent = _indent(key.group(1)) if key else _indent(line) - len(line.lstrip())
        if key and not line.lstrip().startswith("-"):
            if service_indent is None:
                service_indent = indent
            if indent == service_indent:
                services.append({"name": key.group(2), "line": number + 1, "image": "", "ports": []})
                ports_indent = None
                continue
            if services and key.group(2) == "image" and key.group(3):
                services[-1]["image"] = key.group(3).strip("\"'").split("@")[0]
            ports_indent = indent if services and key.group(2) == "ports" else None
            continue
        item = YAML_ITEM.match(line)
        if item and services and ports_indent is not None and _indent(item.group(1)) > ports_indent - 1:
            value = item.group(2).strip("\"'")
            if re.match(r"^[\d.:/a-zA-Z-]+$", value) and any(ch.isdigit() for ch in value):
                services[-1]["ports"].append(value)
    findings = []
    for service in services:
        parts = []
        if service["image"]:
            parts.append(service["image"])
        if service["ports"]:
            parts.append("ports " + ", ".join(service["ports"]))
        label = f"Compose service {service['name']}" + (f" ({'; '.join(parts)})" if parts else "")
        findings.append(Finding("server", label, service["line"]))
    return findings


def render_yaml(path: str, content: str) -> list[Finding]:
    findings: list[Finding] = []
    section = None
    item: dict | None = None
    item_indent = None

    def flush() -> None:
        nonlocal item
        if item and item.get("name"):
            kind = "database" if section == "databases" else "server"
            label = f"Render {item.get('type', 'service')}: {item['name']}" if kind == "server" else f"Render database: {item['name']}"
            findings.append(Finding(kind, label, item["line"]))
        item = None

    for number, line in enumerate(content.splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        top = re.match(r"^([A-Za-z]+):\s*(#.*)?$", line)
        if top:
            flush()
            section = top.group(1)
            item_indent = None
            continue
        if section not in ("services", "databases"):
            continue
        dash = YAML_ITEM.match(line)
        if dash and (item_indent is None or _indent(dash.group(1)) == item_indent):
            flush()
            item_indent = _indent(dash.group(1))
            item = {"line": number}
            line = " " * (item_indent + 2) + dash.group(2)
        key = YAML_KEY.match(line)
        if key and item is not None and key.group(3) and key.group(2) in ("name", "type"):
            item.setdefault(key.group(2), key.group(3).strip("\"'"))
    flush()
    return findings


def procfile(path: str, content: str) -> list[Finding]:
    findings = []
    for number, line in enumerate(content.splitlines(), start=1):
        match = PROCFILE_LINE.match(line.strip())
        if match:
            findings.append(Finding("server", f"Procfile: {match.group(1)}", number))
    return findings


def env_example(path: str, content: str) -> list[Finding]:
    names = []
    for line in content.splitlines():
        name = line.strip().removeprefix("export ").split("=", 1)[0].strip()
        if "=" in line and ENV_NAME.match(name):
            names.append(name)
    if not names:
        return []
    shown = ", ".join(names[:MAX_ENV_NAMES]) + (f", +{len(names) - MAX_ENV_NAMES} more" if len(names) > MAX_ENV_NAMES else "")
    return [Finding("server", f"Environment variables ({len(names)}): {shown}", 1)]


RULES = [
    Rule("dockerfile", _is_dockerfile, dockerfile),
    Rule("compose-services", _is_compose, compose_services),
    Rule("render-yaml", _is_render, render_yaml),
    Rule("procfile", lambda p: basename(p) == "Procfile", procfile),
    Rule("env-example", lambda p: basename(p) in ENV_TEMPLATES, env_example),
]

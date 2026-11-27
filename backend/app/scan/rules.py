# Scan rules: what is ignored and which limits apply.
import re

SKIP_DIRECTORIES = frozenset(
    {"node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__"}
)

SKIP_FILE_EXACT = frozenset(
    {".env", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "bun.lockb"}
)
SKIP_FILE_PREFIXES = (".env.",)
SKIP_FILE_SUFFIXES = (".env", ".lock")

ENV_TEMPLATES = frozenset({".env.example", ".env.sample", ".env.template", ".env.dist"})
ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

BINARY_EXTENSIONS = frozenset(
    {
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".tif", ".tiff", ".avif", ".heic", ".psd",
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".mp3", ".wav", ".ogg", ".flac", ".aac",
        ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war",
        ".pdf", ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".o", ".a", ".pyc", ".wasm",
        ".woff", ".woff2", ".ttf", ".otf", ".eot", ".sqlite", ".db", ".iso", ".dmg",
    }
)  # fmt: skip

MAX_FILE_BYTES = 1_048_576
MAX_FILES = 600
MAX_DEPTH = 50

WHITESPACE = " \t\n\r\f\v"


def should_skip_directory(name: str) -> bool:
    return name in SKIP_DIRECTORIES


def is_env_template(name: str) -> bool:
    return name in ENV_TEMPLATES


def redact_env_template(text: str) -> str:
    names = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        name = line.split("=", 1)[0].strip()
        if ENV_NAME.match(name):
            names.append(name)
    return "".join(f"{name}=\n" for name in names)


def should_skip_file(name: str) -> bool:
    if name in ENV_TEMPLATES:
        return False
    return (
        name in SKIP_FILE_EXACT
        or name.startswith(SKIP_FILE_PREFIXES)
        or name.endswith(SKIP_FILE_SUFFIXES)
    )


def has_binary_extension(name: str) -> bool:
    dot = name.rfind(".")
    return dot > 0 and name[dot:].lower() in BINARY_EXTENSIONS


def is_blank_text(text: str) -> bool:
    return text.strip(WHITESPACE) == ""

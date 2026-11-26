"""Regeln fürs Einlesen. Kopie von schema/scan-rules.json (ein Test prüft das)."""

SKIP_DIRECTORIES = frozenset(
    {"node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__"}
)

SKIP_FILE_EXACT = frozenset({".env"})
SKIP_FILE_PREFIXES = (".env.",)
SKIP_FILE_SUFFIXES = (".env",)

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
MAX_FILES = 400
MAX_DEPTH = 50

# Nur diese Zeichen zählen als "Leerzeichen" (gleich im Frontend).
WHITESPACE = " \t\n\r\f\v"


def should_skip_directory(name: str) -> bool:
    return name in SKIP_DIRECTORIES


def should_skip_file(name: str) -> bool:
    """Geheimnisse (.env-Dateien) werden nie übertragen."""
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

# Maps file extensions to language names.
LANGUAGES = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".java": "java", ".kt": "kotlin",
    ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".cs": "csharp",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".swift": "swift",
    ".html": "html", ".css": "css", ".scss": "scss", ".json": "json",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".md": "markdown",
    ".sql": "sql", ".sh": "shell",
}  # fmt: skip


def extension_of(name: str) -> str | None:
    dot = name.rfind(".")
    return name[dot:].lower() if dot > 0 and dot < len(name) - 1 else None


def language_for(extension: str | None) -> str | None:
    return LANGUAGES.get(extension) if extension else None

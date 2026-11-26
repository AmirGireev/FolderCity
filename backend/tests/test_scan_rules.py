# Checks that the backend rules match scan-rules.json.
import pytest

from app.scan import rules

from fixture_tree import RULES


def test_skip_directories_match():
    assert set(RULES["skipDirectories"]) == rules.SKIP_DIRECTORIES


def test_skip_files_match():
    assert set(RULES["skipFiles"]["exact"]) == rules.SKIP_FILE_EXACT
    assert tuple(RULES["skipFiles"]["prefixes"]) == rules.SKIP_FILE_PREFIXES
    assert tuple(RULES["skipFiles"]["suffixes"]) == rules.SKIP_FILE_SUFFIXES


def test_binary_extensions_match():
    assert set(RULES["binaryExtensions"]) == rules.BINARY_EXTENSIONS


def test_limits_and_whitespace_match():
    assert RULES["limits"] == {
        "maxFileBytes": rules.MAX_FILE_BYTES,
        "maxFiles": rules.MAX_FILES,
        "maxDepth": rules.MAX_DEPTH,
    }
    assert RULES["whitespace"] == rules.WHITESPACE


@pytest.mark.parametrize("name", [".env", ".env.local", ".env.production", "prod.env", "a.env"])
def test_env_files_skipped(name):
    assert rules.should_skip_file(name)


@pytest.mark.parametrize("name", ["environment.py", "env.py", "README.md", "my.environment"])
def test_other_files_not_skipped(name):
    assert not rules.should_skip_file(name)


@pytest.mark.parametrize("name", ["node_modules", ".git", "venv", ".venv", "dist", "build", ".next", "__pycache__"])
def test_skipped_directories(name):
    assert rules.should_skip_directory(name)


def test_binary_extension_is_case_insensitive_and_needs_a_name():
    assert rules.has_binary_extension("PHOTO.JPG")
    assert not rules.has_binary_extension(".png")
    assert not rules.has_binary_extension("readme")

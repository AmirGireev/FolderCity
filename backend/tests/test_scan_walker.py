# Tests scanning folders.
import os
import sys

import pytest

from app.scan import ScanLimits, scan_directory
from app.scan.rules import is_blank_text

from fixture_tree import EXPECTED, make_fixture


def test_fixture_matches_expected_json(tmp_path):
    result = scan_directory(make_fixture(tmp_path))
    assert result.model_dump(mode="json") == EXPECTED


def test_key_order_is_stable(tmp_path):
    data = scan_directory(make_fixture(tmp_path)).model_dump(mode="json")
    assert list(data) == [
        "schemaVersion", "rootName", "directories", "emptyDirectories", "files", "truncated",
    ]  # fmt: skip
    assert list(data["files"][0]) == ["path", "size", "content", "omitted", "isEmpty"]


def test_secrets_and_ignored_folders_never_included(tmp_path):
    result = scan_directory(make_fixture(tmp_path))
    paths = [f.path for f in result.files] + result.directories
    for bad in (".env", ".env.local", "prod.env", "node_modules", ".git", "__pycache__"):
        assert not any(bad in p.split("/") for p in paths), bad


def test_empty_folder_and_empty_file_detected(tmp_path):
    result = scan_directory(make_fixture(tmp_path))
    assert "emptyDir" in result.emptyDirectories
    assert "onlyEmptyChildren" in result.emptyDirectories
    assert "withEmptyFile" not in result.emptyDirectories
    by_path = {f.path: f for f in result.files}
    assert by_path["empty.txt"].isEmpty
    assert by_path["blank.txt"].isEmpty
    assert not by_path["README.md"].isEmpty


def test_is_blank_text():
    assert is_blank_text("")
    assert is_blank_text(" \t\r\n\f\v")
    assert not is_blank_text(" a ")
    assert not is_blank_text(" ")


def test_empty_root(tmp_path):
    root = tmp_path / "nothing"
    root.mkdir()
    result = scan_directory(root)
    assert (result.directories, result.emptyDirectories, result.files) == ([], [], [])
    assert result.truncated is False


def test_binary_by_extension_is_not_read(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "a.png").write_bytes(b"\x89PNG" * 10)
    (root / "empty.png").write_bytes(b"")
    files = {f.path: f for f in scan_directory(root).files}
    assert files["a.png"].omitted == "binary" and files["a.png"].content is None
    assert files["a.png"].size == 40 and not files["a.png"].isEmpty
    assert files["empty.png"].isEmpty


def test_invalid_utf8_counts_as_binary(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "x.txt").write_bytes(b"\xff\xfe\xfa")
    (only,) = scan_directory(root).files
    assert only.omitted == "binary" and only.content is None


def test_too_large_file_has_no_content(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "big.txt").write_text("a" * 50)
    (root / "small.txt").write_text("b" * 5)
    result = scan_directory(root, ScanLimits(max_file_bytes=10))
    files = {f.path: f for f in result.files}
    assert files["big.txt"].omitted == "too_large" and files["big.txt"].content is None
    assert files["big.txt"].size == 50 and not files["big.txt"].isEmpty
    assert files["small.txt"].content == "b" * 5


def test_default_file_size_limit_is_one_megabyte(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "ok.txt").write_text("a" * 1_048_576)
    (root / "big.txt").write_text("a" * 1_048_577)
    files = {f.path: f for f in scan_directory(root).files}
    assert files["ok.txt"].omitted is None
    assert files["big.txt"].omitted == "too_large"


def test_file_limit_truncates_deterministically(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    for name in ("a.txt", "b.txt", "c.txt", "d.txt"):
        (root / name).write_text(name)
    result = scan_directory(root, ScanLimits(max_files=2))
    assert [f.path for f in result.files] == ["a.txt", "b.txt"]
    assert result.truncated is True


def test_truncation_never_claims_a_folder_is_empty(tmp_path):
    root = tmp_path / "r"
    (root / "a").mkdir(parents=True)
    (root / "a" / "one.txt").write_text("1")
    (root / "a" / "two.txt").write_text("2")
    result = scan_directory(root, ScanLimits(max_files=1))
    assert result.truncated is True
    assert "a" not in result.emptyDirectories


def test_exactly_at_file_limit_is_not_truncated(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    for name in ("a.txt", "b.txt"):
        (root / name).write_text(name)
    result = scan_directory(root, ScanLimits(max_files=2))
    assert len(result.files) == 2 and result.truncated is False


def test_depth_limit(tmp_path):
    root = tmp_path / "r"
    deep = root / "a" / "b" / "c"
    deep.mkdir(parents=True)
    (deep / "f.txt").write_text("x")
    result = scan_directory(root, ScanLimits(max_depth=2))
    assert result.directories == ["a", "a/b"]
    assert result.truncated is True
    assert "a/b" not in result.emptyDirectories


@pytest.mark.skipif(sys.platform == "win32", reason="symlinks need extra rights on Windows")
def test_symlinks_are_not_followed(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")
    root = tmp_path / "r"
    root.mkdir()
    (root / "real.txt").write_text("ok")
    os.symlink(outside, root / "link_dir")
    os.symlink(outside / "secret.txt", root / "link_file.txt")
    result = scan_directory(root)
    assert [f.path for f in result.files] == ["real.txt"]
    assert result.directories == []


def test_crlf_and_bom_preserved(tmp_path):
    root = tmp_path / "r"
    root.mkdir()
    (root / "w.txt").write_bytes(b"a\r\nb\r\n")
    (only,) = scan_directory(root).files
    assert only.content == "a\r\nb\r\n"

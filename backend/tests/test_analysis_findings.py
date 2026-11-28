# Tests lint and rule findings: Ruff on a copy, own rules, severities, duplicates and safety.
import subprocess
import sys

import pytest

from app.analysis import findings as findings_module
from app.analysis.findings import find_findings, run_ruff, severity_for
from app.analysis.rules_security import is_test_path, scan_rules


def ruff_available() -> bool:
    try:
        return subprocess.run([sys.executable, "-m", "ruff", "--version"], capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


needs_ruff = pytest.mark.skipif(not ruff_available(), reason="ruff is not installed")


def hits(path: str, code: str):
    return [(h.rule, h.line, h.severity) for h in scan_rules(path, code)]


# ---- FC001: hard-coded secrets --------------------------------------------------------------------------------

def test_python_secrets_in_assignments_arguments_and_dicts():
    code = 'password = "hunter2hunter2"\ndb = connect(host="x", password="s3cretvalue")\ncfg = {"token": "abcdefghij1234"}\n'
    assert hits("a.py", code) == [("FC001", 1, "high"), ("FC001", 2, "high"), ("FC001", 3, "high")]


def test_javascript_secrets_in_declarations_objects_and_assignments():
    code = 'const password = "hunter2hunter2";\nconst cfg = { apiKey: "abcdef123456789" };\nlet client;\nclient.secret = "topsecretvalue";\n'
    assert hits("a.ts", code) == [("FC001", 1, "high"), ("FC001", 2, "high"), ("FC001", 4, "high")]


def test_things_that_are_not_secrets_are_ignored():
    code = (
        'import os\nAPI_KEY = os.environ["KEY"]\nsecret = "changeme"\ntoken_url = "https://example.com/token"\n'
        'password = ""\npassword = "abc"\nname = "hunter2hunter2"\ntoken = f"{prefix}-abcdefgh"\npassword = "<your password>"\n'
    )
    assert hits("a.py", code) == []
    assert hits("a.js", 'const token = process.env.TOKEN;\nconst passwordField = "abcdefghij";\nconst t = `${x}abcdefgh`;\n') == []


def test_known_token_formats_are_found_anywhere():
    code = 'aws = "AKIAABCDEFGHIJKLMNOP"\nkey = """-----BEGIN RSA PRIVATE KEY-----\\nabc"""\nnote = "AKIA is a prefix"\n'
    assert hits("a.py", code) == [("FC001", 1, "high"), ("FC001", 2, "high")]
    assert hits("a.js", 'send("ghp_' + "a" * 36 + '");\n') == [("FC001", 1, "high")]


def test_secrets_in_test_files_are_only_low():
    assert hits("tests/test_login.py", 'password = "hunter2hunter2"\n') == [("FC001", 1, "low")]
    assert hits("src/login.spec.ts", 'const password = "hunter2hunter2";\n') == [("FC001", 1, "low")]
    assert is_test_path("a/__tests__/x.js") and not is_test_path("src/contest.py")


def test_the_message_never_contains_the_secret_value():
    for hit in scan_rules("a.py", 'password = "hunter2hunter2"\naws = "AKIAABCDEFGHIJKLMNOP"\n'):
        assert "hunter2" not in hit.message and "AKIA" not in hit.message


# ---- FC002: eval and exec -------------------------------------------------------------------------------------

def test_eval_and_exec_in_python():
    assert hits("a.py", 'eval(user_input)\nexec("print(1)")\nresult = eval("1+1")\nobj.eval(x)\n') == [
        ("FC002", 1, "high"), ("FC002", 2, "medium"), ("FC002", 3, "medium"),
    ]  # fmt: skip


def test_eval_new_function_and_string_timers_in_javascript():
    code = 'eval(code);\nnew Function("a", "return a");\nsetTimeout("run()", 10);\nsetTimeout(() => run(), 10);\nexec(x);\n'
    assert hits("a.ts", code) == [("FC002", 1, "high"), ("FC002", 2, "high"), ("FC002", 3, "medium")]


# ---- FC003: SQL from strings ----------------------------------------------------------------------------------

def test_sql_built_from_strings_in_python():
    code = (
        'cur.execute("SELECT * FROM t WHERE a=" + a)\ncur.execute(f"DELETE FROM t WHERE id={i}")\n'
        'cur.execute("SELECT * FROM t WHERE a=%s" % a)\ncur.execute("SELECT * FROM t WHERE a={}".format(a))\n'
    )
    assert hits("a.py", code) == [("FC003", 1, "high"), ("FC003", 2, "high"), ("FC003", 3, "high"), ("FC003", 4, "high")]


def test_sql_built_from_strings_in_javascript():
    code = 'db.query("SELECT * FROM t WHERE id=" + id);\ndb.query(`SELECT * FROM t WHERE id=${id}`);\nawait prisma.$queryRawUnsafe(`UPDATE t SET a=${a}`);\n'
    assert hits("a.ts", code) == [("FC003", 1, "high"), ("FC003", 2, "high"), ("FC003", 3, "high")]


def test_safe_sql_is_not_flagged():
    code = 'cur.execute("SELECT * FROM t WHERE a=%s", (a,))\ncur.execute("SELECT 1")\ncur.execute(sql)\ncur.execute("a" + b)\nprint("select " + x)\n'
    assert hits("a.py", code) == []
    assert hits("a.js", 'db.query("SELECT * FROM t WHERE id=$1", [id]);\ndb.query(sql);\nlog("select " + x);\n') == []


def test_unknown_languages_and_broken_code_give_nothing_or_no_crash():
    assert scan_rules("notes.txt", "eval(x)") == []
    assert scan_rules("a.cs", 'eval(x);') == []
    assert isinstance(scan_rules("a.py", "def f(:\n  eval(\n"), list)
    assert scan_rules("a.py", "") == []


# ---- severities and the combination ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("rule", "severity"),
    [("S608", "high"), ("S307", "high"), ("F821", "high"), ("invalid-syntax", "high"), ("F401", "low"), ("F841", "low"), ("B006", "medium"), ("S104", "medium"), ("XYZ", "medium")],
)
def test_severity_of_rules(rule, severity):
    assert severity_for(rule) == severity


@needs_ruff
def test_ruff_finds_security_and_correctness_problems_on_a_copy():
    code = 'import subprocess\npassword = "hunter2"\neval("1+1")\nx = undefined_name\ncur.execute("SELECT * FROM t WHERE a=" + a)\nsubprocess.run("ls", shell=True)\n'
    found = {(f.rule, f.line) for f in find_findings({"app/a.py": code})}
    assert {("S105", 2), ("S307", 3), ("F821", 4), ("S608", 5), ("S602", 6)} <= found


@needs_ruff
def test_findings_carry_file_line_rule_text_severity_and_source():
    [finding] = [f for f in find_findings({"src/a.py": 'password = "hunter2"\n'}) if f.rule == "S105"]
    assert (finding.fileId, finding.line, finding.severity, finding.source) == ("src/a.py", 1, "high", "ruff")
    assert "password" in finding.message and finding.id == "ruff:S105@src/a.py:1"


@needs_ruff
def test_own_rules_are_skipped_where_ruff_already_reported_the_same_line():
    found = find_findings({"a.py": 'password = "hunter2"\neval("1")\ncur.execute("SELECT * FROM t WHERE a=" + a)\n'})
    assert {f.source for f in found if f.line in (1, 2, 3)} == {"ruff"}


@needs_ruff
def test_syntax_errors_are_reported():
    [finding] = find_findings({"a.py": "def f(:\n"})[:1]
    assert finding.severity == "high" and finding.rule == "invalid-syntax"


@needs_ruff
def test_unused_imports_in_init_files_are_ignored():
    assert find_findings({"pkg/__init__.py": "from .a import b\n"}) == []
    assert any(f.rule == "F401" for f in find_findings({"pkg/mod.py": "import os\n"}))


@needs_ruff
def test_ruff_ignores_project_settings_and_noise_rules():
    code = "assert 1 == 1\nimport random\nx = random.random()\n"
    assert find_findings({"a.py": code}) == []


@needs_ruff
def test_the_code_is_only_read_never_run(tmp_path):
    marker = tmp_path / "ran.txt"
    code = f'import pathlib\npathlib.Path(r"{marker}").write_text("x")\n'
    find_findings({"a.py": code, "b.js": f'require("fs").writeFileSync("{marker.as_posix()}", "x");\n'})
    assert not marker.exists()


def test_python_files_without_ruff_still_get_own_rules(monkeypatch):
    monkeypatch.setattr(findings_module, "run_ruff", lambda files: [])
    assert [f.rule for f in find_findings({"a.py": 'eval(x)\n'})] == ["FC002"]
    assert [f.rule for f in find_findings({"a.py": 'eval(x)\n'}, use_ruff=False)] == ["FC002"]


@pytest.mark.parametrize("failure", [FileNotFoundError(), subprocess.TimeoutExpired("ruff", 1), OSError("boom")])
def test_ruff_problems_do_not_break_the_analysis(monkeypatch, failure):
    def broken(*args, **kwargs):
        raise failure

    monkeypatch.setattr(findings_module.subprocess, "run", broken)
    assert run_ruff({"a.py": "x = 1\n"}) == []


def test_ruff_output_that_is_not_json_is_ignored(monkeypatch):
    class Done:
        stdout = "No module named ruff"

    monkeypatch.setattr(findings_module.subprocess, "run", lambda *a, **k: Done())
    assert run_ruff({"a.py": "x = 1\n"}) == []


def test_ruff_is_called_without_a_shell_on_a_copy(monkeypatch):
    seen = {}

    class Done:
        stdout = "[]"

    def fake(command, **kwargs):
        seen.update(kwargs=kwargs, command=command)
        return Done()

    monkeypatch.setattr(findings_module.subprocess, "run", fake)
    run_ruff({"weird name/../x.py": "x = 1\n"})
    assert seen["kwargs"]["shell"] is False and seen["kwargs"]["timeout"] > 0
    assert "--isolated" in seen["command"] and "--no-cache" in seen["command"]
    assert all("weird" not in part for part in seen["command"])


def test_findings_are_sorted_and_unique():
    found = find_findings({"b.ts": "eval(x);\neval(y);\n", "a.ts": "eval(z);\n"}, use_ruff=False)
    assert [(f.fileId, f.line) for f in found] == [("a.ts", 1), ("b.ts", 1), ("b.ts", 2)]
    assert len({f.id for f in found}) == len(found)

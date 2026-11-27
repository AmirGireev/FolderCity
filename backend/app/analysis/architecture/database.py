# Rules that find database access: raw SQL, SQLAlchemy, Django, Prisma, Mongoose and database drivers.
from __future__ import annotations

import re

from .rules import CODE, JAVASCRIPT, PYTHON, Finding, Rule, line_of

SQL_FRAGMENT = (
    r"(?:SELECT\b[^;\n]*?\bFROM|INSERT\s+INTO|DELETE\s+FROM|UPDATE(?=\s+[\w.\"`\[\]]+\s+SET\b))\s+[\"`\[]?([A-Za-z_][\w.]*)"
)
SQL_QUOTED = re.compile(r"""["'`][^\n]*?\b""" + SQL_FRAGMENT)
SQL_LINE_START = re.compile(r"^[ \t]*" + SQL_FRAGMENT, re.MULTILINE)
SQL_LOWERCASE_STAR = re.compile(r"""["'`][^\n]*?\bselect\s+\*\s+from\s+[\"`\[]?([A-Za-z_][\w.]*)""")
SQLALCHEMY_IMPORT = re.compile(r"^[ \t]*(?:from|import)[ \t]+sqlalchemy\b|\bcreate_engine\(", re.MULTILINE)
SQLALCHEMY_MODEL = re.compile(r"\.query\(\s*([A-Z]\w*)|\bselect\(\s*([A-Z]\w*)")
DJANGO_ORM = re.compile(
    r"\b([A-Z]\w*)\.objects\.(?:filter|get|all|create|exclude|update|delete|aggregate|count|values|first|last|bulk_create|get_or_create|update_or_create|order_by|annotate)\b"
)
PRISMA_MODEL = re.compile(
    r"\bprisma\.([a-z]\w*)\.(?:findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\b"
)
PRISMA_CLIENT = re.compile(r"\bnew\s+PrismaClient\(")
MONGOOSE_MODEL = re.compile(r"""\bmongoose\.model\(\s*["'](\w+)["']""")
MONGOOSE_CONNECT = re.compile(r"\bmongoose\.connect\(")
PYMONGO = re.compile(r"\bMongoClient\(")
PG_IMPORT = re.compile(r"""from\s+["']pg["']|require\(\s*["']pg["']\s*\)""")
PG_CLIENT = re.compile(r"\bnew\s+(?:Pool|Client)\(")
PY_POSTGRES = re.compile(r"\b(?:psycopg2|psycopg|asyncpg)\.(?:connect|create_pool)\(")
PY_SQLITE = re.compile(r"\bsqlite3\.connect\(")
PY_MYSQL = re.compile(r"\b(?:pymysql|MySQLdb)\.connect\(|\bmysql\.connector\.connect\(")


def _first(pattern: re.Pattern[str], content: str) -> int | None:
    match = pattern.search(content)
    return line_of(content, match.start()) if match else None


def _single(label: str, pattern: re.Pattern[str], content: str) -> list[Finding]:
    line = _first(pattern, content)
    return [Finding("database", label, line)] if line else []


def raw_sql(path: str, content: str) -> list[Finding]:
    findings = []
    for pattern in (SQL_QUOTED, SQL_LINE_START, SQL_LOWERCASE_STAR):
        for match in pattern.finditer(content):
            findings.append(Finding("database", f"SQL: {match.group(1)}", line_of(content, match.start(1))))
    return findings


def sqlalchemy(path: str, content: str) -> list[Finding]:
    if "sqlalchemy" not in content.lower() and "create_engine(" not in content:
        return []
    findings = _single("SQLAlchemy", SQLALCHEMY_IMPORT, content)
    for match in SQLALCHEMY_MODEL.finditer(content):
        findings.append(Finding("database", f"SQLAlchemy: {match.group(1) or match.group(2)}", line_of(content, match.start())))
    return findings


def django_orm(path: str, content: str) -> list[Finding]:
    return [Finding("database", f"Django: {m.group(1)}", line_of(content, m.start())) for m in DJANGO_ORM.finditer(content)]


def prisma(path: str, content: str) -> list[Finding]:
    findings = _single("Prisma", PRISMA_CLIENT, content)
    findings += [Finding("database", f"Prisma: {m.group(1)}", line_of(content, m.start())) for m in PRISMA_MODEL.finditer(content)]
    return findings


def mongo(path: str, content: str) -> list[Finding]:
    findings = [Finding("database", f"Mongoose: {m.group(1)}", line_of(content, m.start())) for m in MONGOOSE_MODEL.finditer(content)]
    findings += _single("MongoDB", MONGOOSE_CONNECT, content) + _single("MongoDB", PYMONGO, content)
    return findings


def pg_driver(path: str, content: str) -> list[Finding]:
    if not PG_IMPORT.search(content):
        return []
    return _single("PostgreSQL (pg)", PG_CLIENT, content)


def python_drivers(path: str, content: str) -> list[Finding]:
    return (
        _single("PostgreSQL", PY_POSTGRES, content)
        + _single("SQLite", PY_SQLITE, content)
        + _single("MySQL", PY_MYSQL, content)
    )


RULES = [
    Rule("raw-sql", CODE, raw_sql),
    Rule("sqlalchemy", PYTHON, sqlalchemy),
    Rule("django-orm", PYTHON, django_orm),
    Rule("prisma", JAVASCRIPT, prisma),
    Rule("mongo", lambda p: PYTHON(p) or JAVASCRIPT(p), mongo),
    Rule("pg-driver", JAVASCRIPT, pg_driver),
    Rule("python-db-drivers", PYTHON, python_drivers),
]

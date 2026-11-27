# Tests every architecture rule on its own, plus the combination into architecture nodes.
import pytest

from app.analysis.architecture import ALL_RULES, detect_architecture, findings_for_file
from app.analysis.architecture import api, database, external, servers
from app.scan.model import ScanFile


def labels(findings):
    return [(f.kind, f.label, f.line) for f in findings]


# ---- API routes -----------------------------------------------------------------------------------------------

def test_python_routes_fastapi_style():
    code = '@app.get("/items")\ndef a(): ...\n\n@router.post(\'/items/{id}\')\nasync def b(): ...\n\n@app.websocket("/ws")\n'
    assert labels(api.python_routes("main.py", code)) == [
        ("api", "GET /items", 1), ("api", "POST /items/{id}", 4), ("api", "WS /ws", 7),
    ]  # fmt: skip


def test_python_routes_flask_route_with_methods():
    code = '@app.route("/login", methods=["GET", "POST"])\ndef login(): ...\n\n@bp.route("/home")\ndef home(): ...\n'
    assert labels(api.python_routes("a.py", code)) == [("api", "GET,POST /login", 1), ("api", "GET /home", 4)]


def test_python_routes_ignore_mock_patch_and_other_decorators():
    code = '@patch("app.module.func")\n@mock.patch("x.y")\n@app.get(path_variable)\n@functools.lru_cache(maxsize=1)\ndef f(): ...\n'
    assert api.python_routes("test_a.py", code) == []


def test_express_routes():
    code = "app.get('/users', handler);\nrouter.post(\"/users/:id\", h);\nserver.all(`/any`, h);\ncache.get('/not-a-route');\napp.use('/mount', r);\n"
    assert labels(api.express_routes("server.js", code)) == [
        ("api", "GET /users", 1), ("api", "POST /users/:id", 2), ("api", "ANY /any", 3),
    ]  # fmt: skip


def test_nextjs_app_router_routes_list_their_methods():
    code = "export async function GET(req) {}\n\nexport const POST = async () => {}\nfunction helper() {}\n"
    assert labels(api.nextjs_routes("web/app/api/users/[id]/route.ts", code)) == [
        ("api", "GET /api/users/[id]", 1), ("api", "POST /api/users/[id]", 3),
    ]  # fmt: skip


def test_nextjs_route_without_exports_and_route_groups():
    assert labels(api.nextjs_routes("app/api/(admin)/stats/route.js", "")) == [("api", "ANY /api/stats", 1)]
    assert labels(api.nextjs_routes("app/api/route.ts", "export function GET() {}")) == [("api", "GET /api", 1)]


def test_nextjs_pages_router_routes():
    assert labels(api.nextjs_routes("pages/api/hello.ts", "")) == [("api", "ANY /api/hello", 1)]
    assert labels(api.nextjs_routes("src/pages/api/users/index.js", "")) == [("api", "ANY /api/users", 1)]


def test_nextjs_ignores_other_files():
    assert api.nextjs_routes("app/page.tsx", "export function GET() {}") == []
    assert api.nextjs_routes("app/users/route.ts", "export function GET() {}") == []


# ---- Databases ------------------------------------------------------------------------------------------------

def test_raw_sql_in_strings_and_multiline_blocks():
    code = (
        'cur.execute("SELECT id, name FROM users WHERE id = %s")\n'
        "q = '''\nINSERT INTO orders (a) VALUES (1)\n'''\n"
        'db.run("UPDATE accounts SET balance = 0")\n'
        "db.run(`DELETE FROM sessions`)\n"
        'x = "select * from lowercase_table"\n'
    )
    assert labels(database.raw_sql("a.py", code)) == [
        ("database", "SQL: users", 1),
        ("database", "SQL: accounts", 5),
        ("database", "SQL: sessions", 6),
        ("database", "SQL: orders", 3),
        ("database", "SQL: lowercase_table", 7),
    ]  # fmt: skip


def test_raw_sql_ignores_prose_and_comments():
    code = '# SELECT a FROM b\nprint("Please select a file from the menu")\nmsg = "update the profile"\n'
    assert database.raw_sql("a.py", code) == []


def test_sqlalchemy_and_its_models():
    code = "from sqlalchemy import select\n\nrows = session.query(User).all()\nstmt = select(Order)\n"
    assert labels(database.sqlalchemy("a.py", code)) == [
        ("database", "SQLAlchemy", 1), ("database", "SQLAlchemy: User", 3), ("database", "SQLAlchemy: Order", 4),
    ]  # fmt: skip
    assert database.sqlalchemy("a.py", "rows = items.query(User)\n") == []


def test_django_orm_models():
    code = "users = User.objects.filter(active=True)\nOrder.objects.create(a=1)\nx = Model.objects.custom\n"
    assert labels(database.django_orm("views.py", code)) == [("database", "Django: User", 1), ("database", "Django: Order", 2)]


def test_prisma_client_and_models():
    code = "const prisma = new PrismaClient();\nconst u = await prisma.user.findMany();\nawait prisma.post.create({});\nprisma.$connect();\n"
    assert labels(database.prisma("db.ts", code)) == [
        ("database", "Prisma", 1), ("database", "Prisma: user", 2), ("database", "Prisma: post", 3),
    ]  # fmt: skip


def test_mongoose_and_pymongo():
    code = "mongoose.connect(url);\nconst U = mongoose.model('User', schema);\n"
    assert labels(database.mongo("m.js", code)) == [("database", "Mongoose: User", 2), ("database", "MongoDB", 1)]
    assert labels(database.mongo("m.py", "c = MongoClient(uri)\n")) == [("database", "MongoDB", 1)]


def test_pg_driver_needs_the_pg_import():
    code = "const { Pool } = require('pg');\nconst pool = new Pool({});\n"
    assert labels(database.pg_driver("db.js", code)) == [("database", "PostgreSQL (pg)", 2)]
    assert database.pg_driver("db.js", "const pool = new Pool({});\n") == []


def test_python_database_drivers():
    code = "import psycopg2\nc = psycopg2.connect(dsn)\nd = sqlite3.connect('a.db')\ne = pymysql.connect()\n"
    assert labels(database.python_drivers("a.py", code)) == [
        ("database", "PostgreSQL", 2), ("database", "SQLite", 3), ("database", "MySQL", 4),
    ]  # fmt: skip


# ---- External APIs --------------------------------------------------------------------------------------------

def test_python_http_calls_with_host_or_dynamic_url():
    code = (
        'r = requests.get("https://api.github.com/users")\n'
        "r2 = httpx.post(url, json={})\n"
        "c = httpx.AsyncClient()\n"
        'f = requests.get(f"https://{host}/x")\n'
    )
    assert labels(external.python_http("a.py", code)) == [
        ("external", "requests: api.github.com", 1),
        ("external", "httpx: dynamic URL", 2),
        ("external", "requests: dynamic URL", 4),
        ("external", "httpx.AsyncClient client", 3),
    ]  # fmt: skip


def test_javascript_http_calls():
    code = (
        "await fetch('https://api.stripe.com/v1/charges', {});\n"
        "await fetch('/api/internal');\n"
        "await fetch(`${API_URL}/city`);\n"
        "await fetch(url);\n"
        "axios.get(\"http://example.org:8080/a\");\n"
        "axios.post(endpoint, data);\n"
    )
    assert labels(external.javascript_http("a.ts", code)) == [
        ("external", "fetch: api.stripe.com", 1),
        ("external", "fetch: dynamic URL", 3),
        ("external", "fetch: dynamic URL", 4),
        ("external", "axios: example.org:8080", 5),
        ("external", "axios: dynamic URL", 6),
    ]  # fmt: skip


# ---- Servers and containers -----------------------------------------------------------------------------------

def test_dockerfile_image_and_ports():
    code = "FROM node:20 AS build\nRUN npm ci\nFROM python:3.12-slim\nEXPOSE 8000 9000/tcp\nCMD [\"x\"]\n"
    assert labels(servers.dockerfile("Dockerfile", code)) == [("server", "Dockerfile: python:3.12-slim (port 8000, 9000)", 1)]
    assert servers.dockerfile("Dockerfile", "RUN echo\n") == []


def test_compose_services_with_images_and_ports():
    code = (
        "services:\n"
        "  db:\n"
        "    image: pgvector/pgvector:pg16\n"
        "    ports:\n"
        '      - "5432:5432"\n'
        "  backend:\n"
        "    build: ./backend\n"
        "    ports:\n"
        "      - 8000:8000\n"
        "      - '9000:9000'\n"
        "    environment:\n"
        "      - FOO=bar\n"
        "  worker:\n"
        "    build: .\n"
        "volumes:\n"
        "  data:\n"
    )
    assert labels(servers.compose_services("docker-compose.yml", code)) == [
        ("server", "Compose service db (pgvector/pgvector:pg16; ports 5432:5432)", 2),
        ("server", "Compose service backend (ports 8000:8000, 9000:9000)", 6),
        ("server", "Compose service worker", 13),
    ]  # fmt: skip


def test_compose_without_services_gives_nothing():
    assert servers.compose_services("compose.yaml", "version: '3'\n") == []


def test_render_yaml_services_and_databases():
    code = (
        "services:\n"
        "  - type: web\n"
        "    name: api\n"
        "    env: python\n"
        "  - name: worker\n"
        "    type: worker\n"
        "databases:\n"
        "  - name: appdb\n"
        "    plan: free\n"
    )
    assert labels(servers.render_yaml("render.yaml", code)) == [
        ("server", "Render web: api", 2), ("server", "Render worker: worker", 5), ("database", "Render database: appdb", 8),
    ]  # fmt: skip


def test_procfile_processes():
    assert labels(servers.procfile("Procfile", "web: gunicorn app:app\nworker: python worker.py\n\n")) == [
        ("server", "Procfile: web", 1), ("server", "Procfile: worker", 2),
    ]  # fmt: skip


def test_env_example_lists_only_names():
    result = servers.env_example(".env.example", "DB_URL=\nTOKEN=\nA=\nB=\nC=\nD=\nE=\n")
    assert labels(result) == [("server", "Environment variables (7): DB_URL, TOKEN, A, B, C, D, +1 more", 1)]
    assert servers.env_example(".env.example", "") == []


# ---- Combination ----------------------------------------------------------------------------------------------

def test_every_rule_has_a_unique_name():
    names = [rule.name for rule in ALL_RULES]
    assert len(names) == len(set(names))
    assert len(names) >= 15


def test_rules_only_apply_to_their_files():
    assert findings_for_file("README.md", '@app.get("/x")\nrequests.get("https://a.b")\n') == []


def test_findings_are_deduplicated_per_file_and_keep_the_first_line():
    code = 'a = requests.get("https://x.io/1")\nb = requests.get("https://x.io/2")\n'
    assert labels(findings_for_file("a.py", code)) == [("external", "requests: x.io", 1)]


def scan_file(path: str, content: str) -> ScanFile:
    return ScanFile(path=path, size=len(content), content=content, omitted=None, isEmpty=not content.strip())


def test_detect_architecture_builds_unique_nodes_sorted_by_file():
    files = [
        scan_file("b/db.py", 'import psycopg2\nc = psycopg2.connect()\n'),
        scan_file("a/main.py", '@app.get("/health")\ndef h(): ...\n'),
        scan_file("logo.png", "binary-ish"),
    ]
    files.append(ScanFile(path="skip.py", size=1, content=None, omitted="too_large", isEmpty=False))
    nodes = detect_architecture(files)
    assert [(n.kind, n.label, n.fileId, n.line) for n in nodes] == [
        ("api", "GET /health", "a/main.py", 1),
        ("database", "PostgreSQL", "b/db.py", 2),
    ]
    assert len({n.id for n in nodes}) == len(nodes)


@pytest.mark.parametrize("path", ["Dockerfile", "docker-compose.yml", "render.yaml", "Procfile", ".env.example"])
def test_server_files_are_recognized_by_name(path):
    applying = [rule.name for rule in servers.RULES if rule.applies(path)]
    assert len(applying) == 1


def test_detection_on_this_projects_own_backend():
    from pathlib import Path

    from app.scan.walker import scan_directory

    nodes = detect_architecture(scan_directory(Path(__file__).resolve().parents[1]).files)
    found = {(n.kind, n.label, n.fileId) for n in nodes}
    assert ("api", "GET /health", "app/main.py") in found
    assert ("api", "POST /city", "app/main.py") in found
    assert ("api", "POST /import/github", "app/main.py") in found
    assert ("server", "Dockerfile: python:3.12-slim (port 8000)", "Dockerfile") in found

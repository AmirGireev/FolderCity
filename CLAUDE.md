# FolderCity – Regeln für Claude Code

FolderCity visualisiert einen Code-Ordner bzw. ein Repository als 3D-Stadt
(Ordner = Plattformen, Dateien = Gebäude).

## Bauplan
- Verbindlicher Leitfaden: `docs/FolderCity - Step by step Guide.pdf`.
- Vor jedem Schritt Anforderungen und „Fertig wenn“ im PDF nachlesen.
- Immer nur den angeforderten Schritt umsetzen, nicht vorgreifen.
- Zu jedem Schritt Tests schreiben und das „Fertig wenn“-Kriterium selbst prüfen.

## Architektur-Regeln (verbindlich)
1. **Deterministische Analyse strikt getrennt von der KI-Schicht.**
   tree-sitter, Import-Graph und Linter liegen in eigenen Modulen
   (`backend/app/analysis/…`) und importieren niemals etwas aus der KI-Schicht
   (`backend/app/ai/…`). Die KI-Schicht liest nur fertige Analyseergebnisse.
2. **Ein gemeinsames Datenmodell: `CityModel`.**
   Quelle der Wahrheit ist `schema/citymodel.schema.json`.
   Backend (`backend/app/models/city_model.py`, Pydantic) und Frontend
   (`frontend/src/types/cityModel.ts`) müssen dazu passen; Tests prüfen das.
   Dasselbe JSON ist auch das Format der vorberechneten Demos.
3. **Fremder Code wird nie ausgeführt.** Hochgeladene oder geklonte Repos werden
   nur als Text gelesen und statisch analysiert – kein `import`, `exec`, `eval`,
   `npm install`, `pip install`, Build oder Testlauf darauf.
4. **Komplexe Ebenen sind standardmäßig aus.** Analyse- und Architektur-Ebenen
   (Import-Kanten, APIs, Datenbanken, Befunde) muss der Nutzer aktiv einschalten.

## Ignorieren
Niemals anfassen oder durchsuchen: `node_modules`, `.venv`, `venv`,
`__pycache__`, `.next`, `dist`, `build`, `.git`, `.env`-Dateien.

## Aufbau
- `frontend/` – Next.js (App Router) + TypeScript
- `backend/` – Python 3.12, FastAPI
- `schema/` – CityModel-JSON-Schema + Beispiel
- `docker-compose.yml` – PostgreSQL mit pgvector (`pgvector/pgvector`), Backend, Frontend

## Befehle
- Alles starten: `docker compose up --build`
  (Frontend: http://localhost:3000, Backend: http://localhost:8000/health)
- Backend-Tests: `cd backend && pip install -r requirements-dev.txt && pytest`
- Frontend-Tests: `cd frontend && npm install && npm test`

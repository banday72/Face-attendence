# Smart University Attendance Management System

A full-stack university attendance platform with role-based portals for admins, professors, and students. Attendance can be recorded with short-lived rotating QR codes, encrypted face embeddings with active liveness checks, or professor/manual corrections. All dashboards and reports are backed by PostgreSQL.

## Features

- Admin portal: departments, users, courses, classes, enrollments, audit logs, statistics, and reports.
- Professor portal: assigned classes, session scheduling, QR generation/rotation, live roster, face policy, manual correction, and exports.
- Student portal: registration, enrollment view, schedule, QR scanner, face registration/check-in, history, percentages, and warnings.
- Dynamic QR: opaque `uat:v1:<token>` payloads, server-side hash storage, expiry, rotation, one-use enforcement, enrollment checks, and GPS radius validation.
- Face biometrics: browser-generated 128-d descriptors encrypted with Fernet, consent versioning, duplicate-descriptor prevention, movement heuristics, retention purge, and deletion endpoint.
- Attendance rules: one record per student per session, configurable lateness, automatic absent marking on close, audited corrections, and manual fallback.
- Correction workflow: students request status changes (including for missing records) with one pending request per session; professors/admins review with an audit trail, rejected reviews require a note, approvals keep an existing record's method unless overridden, and pending requests can be withdrawn.
- Student self-service: searchable attendance history, profile editing, biometric consent and face-data export, role-aware alerts, and PDF/XLSX attendance certificates.
- Professor tools: missing-attendance list, mark remaining students absent, and at-risk class overview.
- Bulk import: CSV template, preview, persisted upload history, and downloadable per-row error CSV.
- Reports: saved filter presets (atomic default switching), `class_id` filtering, and scheduled exports that run automatically every 60 seconds in non-test environments with paginated in-app run history and downloads; no email delivery.
- Analytics: daily/weekly/monthly/course/student/professor/department summaries with XLSX and PDF exports.
- UI: Next.js App Router, TypeScript, Tailwind CSS, shadcn-style components, Recharts, responsive layouts, light/dark mode, loading/error/empty states, and toasts.

## Repository layout

```text
backend/   FastAPI API, SQLAlchemy models, Alembic migration, services, tests
frontend/  Next.js 15 application and UI components
docs/      API contract and architecture notes
scripts/   Local setup and startup helpers
```

## Quick start with Docker

Docker Compose starts PostgreSQL, seeds development data, and serves the API and frontend. The API applies Alembic migrations at startup against the `DATABASE_URL` it uses at runtime.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

Face processing runs in the browser after loading locally hosted `face-api.js` assets from `frontend/public/face-api`. No server-side face model or `face_models` volume is required. Raw camera frames are never uploaded; only descriptor vectors and face-center points are sent to the API.

Stop the stack:

```powershell
docker compose down
```

Include database data:

```powershell
docker compose down -v
```

## Local development without Docker

### One-command local startup

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

The script creates ignored local `.env` files if missing, runs the Alembic migration, seeds development accounts, starts the API on port 8000 and the frontend on port 3000, then checks both URLs. Open http://localhost:3000/login and sign in with `admin@university.edu` / `Admin123!`. Logs are written to `.dev-logs/`.

If you only want to prepare the environment without starting servers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -NoStart
```

### Prerequisites

- Python 3.11+
- Node.js 22+
- PostgreSQL 16+ (or SQLite for local API development/tests)

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
Copy-Item .env.example .env
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The example backend environment uses SQLite and `ALLOW_DEV_SECRETS=1`. For PostgreSQL, set `DATABASE_URL` to a `postgresql+psycopg://...` URL before running migrations.

### Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

The frontend defaults to `http://localhost:8000/api/v1` in development. Production builds ignore localhost values and use the same-origin `/api/v1` route unless `NEXT_PUBLIC_API_URL` is a non-local API URL.

Camera and geolocation APIs require HTTPS or `localhost`.

## Development accounts

Seeding is development-only. It does not create fake attendance records or face embeddings.

| Role | Email | Password |
|---|---|---|
| Admin | admin@university.edu | Admin123! |
| Professor | professor@university.edu | Professor123! |
| Student | student@university.edu | Student123! |

Additional seeded accounts use the same role passwords: `professor2@university.edu` and `student2@university.edu` through `student5@university.edu`.

To seed a shared non-production database explicitly, set `FORCE_SEED=1` and run `python -m app.seed`.

## End-to-end attendance flow

1. Log in as the professor and open **Sessions**.
2. Create a session for a class and classroom, set the policy, then start it.
3. The monitor displays the current QR code. Students scan it in the student portal.
4. The student scanner captures GPS, submits the opaque token, and the backend validates expiry, enrollment, session state, and classroom radius.
5. Alternatively, students with registered faces use **Face verification**, complete the displayed challenge, and submit frames plus location when required.
6. The professor sees live counts and the roster. Closing the session marks enrolled students without records as absent.
7. Corrections require a reason and are written to the audit log.
8. If a record is missing or incorrect, the student submits a correction request; a professor or admin reviews it. Approval creates or updates the record and writes audit entries.

## Verification

```powershell
cd backend
py -m pytest -q
py -m ruff check app tests
py -m mypy app
py -m compileall app
```

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

At the time of writing, the backend passes `py -m pytest -q` (57 passed) and `py -m ruff check app tests`; frontend `npm run lint`, `npx tsc --noEmit`, and `npm run build` also passed (40 static pages generated; `/professor/sessions/[id]` dynamic).

## API contract

- Human-readable business rules: `docs/api-contract.md`
- Generated OpenAPI: http://localhost:8000/openapi.json
- Swagger UI: http://localhost:8000/docs

OpenAPI is generated from FastAPI and is the machine-readable source of truth. The written contract records business rules, error codes, and authorization intent.

## Security and privacy notes

- JWT access tokens are kept in frontend memory; refresh tokens are HttpOnly cookies with rotation and reuse detection.
- Passwords are bcrypt-hashed. Role and ownership checks are enforced on the backend.
- Face descriptor vectors are encrypted at rest. Raw camera frames stay in the browser and are never uploaded or stored.
- Biometric collection requires explicit consent at the current policy version. Students can delete their biometric data and request correction through the professor/manual path.
- Movement checks are heuristics on browser-supplied descriptor centers. They reduce casual photo/video replay but are not strong anti-spoofing; client code can be modified. GPS coordinates are also browser-supplied and can be spoofed. Combine these checks with short-lived QR sessions and professor supervision.
- Audit logs record session lifecycle events, face registration/deletion, and attendance corrections.
- Rate limiting uses process-local storage by default. Set `RATE_LIMIT_STORAGE_URI=redis://...` and configure trusted proxies when running multiple API instances. See `docs/privacy-and-accessibility.md` for data handling and limitations.
- For production, set `ENVIRONMENT=production`, `ALLOW_DEV_SECRETS=0`, unique 32+ character secrets, HTTPS, real CORS origins, and trusted proxy IPs. Development seeding is disabled automatically.

## Deployment notes

Compose uses a multi-stage Next.js standalone image and a non-root FastAPI container. Put both services behind a TLS-terminating reverse proxy in production, expose only the proxy publicly, persist the PostgreSQL volume, and configure database backups. At API startup, `run_database_migrations()` in `backend/app/main.py` runs Alembic against the same `DATABASE_URL` as the running API; `verify_database_readiness()` runs afterward and only checks the result. The Docker/Render command no longer invokes the Alembic CLI before Uvicorn, and the container honors Render's `PORT` variable. `DATABASE_URL` must point to the production PostgreSQL database used at runtime; if it is missing or wrong, startup fails with a config/migration error. Set `NEXT_PUBLIC_API_URL` at frontend build time because Next.js inlines public environment variables during compilation.

### Vercel monorepo deployment

The root `vercel.json` routes `/api/*` to the FastAPI service and all other paths to the Next.js service. Set these Vercel project variables:

- `NEXT_PUBLIC_API_URL=/api/v1` (build-time frontend variable)
- `ENVIRONMENT=production`, `ALLOW_DEV_SECRETS=0`
- `DATABASE_URL` pointing to the managed PostgreSQL instance used by the running API
- Unique `JWT_SECRET` and `FACE_ENCRYPTION_KEY`
- `CORS_ORIGINS=https://your-domain.example`
- `TRUSTED_PROXY_IPS` for the Vercel proxy range

Vercel no longer runs `alembic upgrade head` as a build command; the `vercel.json` `buildCommand` is an echo. Build-time migrations targeted a different/ephemeral database and caused `Database has not been migrated` at runtime, so migrations now run at API startup against the runtime `DATABASE_URL`. The backend installs only `backend/requirements.txt`; no native face stack is needed.

### Browser face processing

Face recognition runs in the browser with `face-api.js`. The browser detects the face, generates 128-d descriptors, and sends only descriptor vectors and face-center points to the API. Raw camera frames stay in the browser and are never uploaded. The API keeps authentication, consent, audit logging, liveness checks, encrypted embeddings, and matching.

This removes the need for `FACE_SERVICE_URL`, Render, InsightFace, tunnels, and a locally hosted worker. Existing InsightFace embeddings were cleared by migration because the new vectors are 128-d; students must re-register face data. Browser-side matching is not strong anti-spoofing: client code can be modified, so the professor/manual correction path remains the fallback for students unable to use biometrics.

See `docs/architecture.md` for data model and flow details.

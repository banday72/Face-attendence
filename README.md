# Smart University Attendance Management System

A full-stack university attendance platform with role-based portals for admins, professors, and students. Attendance can be recorded with short-lived rotating QR codes, encrypted face embeddings with active liveness checks, or professor/manual corrections. All dashboards and reports are backed by PostgreSQL.

## Features

- Admin portal: departments, users, courses, classes, enrollments, audit logs, statistics, and reports.
- Professor portal: assigned classes, session scheduling, QR generation/rotation, live roster, face policy, manual correction, and exports.
- Student portal: registration, enrollment view, schedule, QR scanner, face registration/check-in, history, percentages, and warnings.
- Dynamic QR: opaque `uat:v1:<token>` payloads, server-side hash storage, expiry, rotation, one-use enforcement, enrollment checks, and GPS radius validation.
- Face biometrics: InsightFace embeddings encrypted with Fernet, consent versioning, duplicate-face prevention, movement-based liveness heuristics, retention purge, and deletion endpoint.
- Attendance rules: one record per student per session, configurable lateness, automatic absent marking on close, audited corrections, and manual fallback.
- Analytics: daily/weekly/monthly/course/student/professor/department summaries with XLSX and PDF exports.
- UI: Next.js App Router, TypeScript, Tailwind CSS, shadcn-style components, Recharts, responsive layouts, light/dark mode, loading/error/empty states, and toasts.

## Repository layout

```text
backend/   FastAPI API, SQLAlchemy models, Alembic migration, services, tests
frontend/  Next.js 15 application and UI components
docs/      API contract and architecture notes
```

## Quick start with Docker

Docker Compose starts PostgreSQL, runs the Alembic migration, seeds development data, and serves the API and frontend.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

The InsightFace model pack is downloaded on first face registration/check-in and cached in the `face_models` volume. Internet access is required for that first download unless the model is preloaded into the cache.

Stop the stack:

```powershell
docker compose down
```

Include database data:

```powershell
docker compose down -v
```

## Local development without Docker

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

The frontend defaults to `http://localhost:8000/api/v1`. Update `NEXT_PUBLIC_API_URL` if the API runs elsewhere.

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
npm run build
```

## API contract

- Human-readable business rules: `docs/api-contract.md`
- Generated OpenAPI: http://localhost:8000/openapi.json
- Swagger UI: http://localhost:8000/docs

OpenAPI is generated from FastAPI and is the machine-readable source of truth. The written contract records business rules, error codes, and authorization intent.

## Security and privacy notes

- JWT access tokens are kept in frontend memory; refresh tokens are HttpOnly cookies with rotation and reuse detection.
- Passwords are bcrypt-hashed. Role and ownership checks are enforced on the backend.
- Face embeddings are encrypted at rest. Raw camera frames are decoded in memory and never written to storage.
- Biometric collection requires explicit consent at the current policy version. Students can delete their biometric data and request correction through the professor/manual path.
- Liveness uses frame count, single-face detection, and movement heuristics. It reduces casual photo/video spoofing but is not a guarantee against a determined attacker. GPS can also be spoofed; combine it with short-lived QR sessions and professor supervision.
- Audit logs record session lifecycle events, face registration/deletion, and attendance corrections.
- In-memory rate limiting is suitable for a single process. Use a shared Redis-backed limiter and trusted-proxy configuration when running multiple instances.
- For production, set `ENVIRONMENT=production`, `ALLOW_DEV_SECRETS=0`, unique 32+ character secrets, HTTPS, real CORS origins, and trusted proxy IPs. Development seeding is disabled automatically.

## Deployment notes

Compose uses a multi-stage Next.js standalone image and a non-root FastAPI container. Put both services behind a TLS-terminating reverse proxy in production, expose only the proxy publicly, persist PostgreSQL and face-model volumes, and configure backups for the database. Set `NEXT_PUBLIC_API_URL` at frontend build time because Next.js inlines public environment variables during compilation.

### Vercel monorepo deployment

The root `vercel.json` routes `/api/*` to the FastAPI service and all other paths to the Next.js service. Set these Vercel project variables:

- `NEXT_PUBLIC_API_URL=/api/v1` (build-time frontend variable)
- `ENVIRONMENT=production`, `ALLOW_DEV_SECRETS=0`
- `DATABASE_URL` pointing to a managed PostgreSQL instance
- Unique `JWT_SECRET` and `FACE_ENCRYPTION_KEY`
- `CORS_ORIGINS=https://your-domain.example`
- `TRUSTED_PROXY_IPS` for the Vercel proxy range

Run `alembic upgrade head` as a release step or manually before serving traffic. The Vercel backend installs only `backend/requirements.txt`; the face stack is in `backend/requirements-face.txt` and is intentionally excluded to stay under the 500 MB Python bundle limit. Face endpoints return `503 face_model_unavailable` on Vercel. Deploy the Docker Compose backend (or another long-running Python service that installs both requirements files) for face registration/check-in, and preload the InsightFace model into a persistent volume. Use a shared Redis-backed rate limiter when running multiple instances.

See `docs/architecture.md` for data model and flow details.

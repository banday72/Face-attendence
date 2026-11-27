# Complete Project Audit

Repository: `Face  attendence software`
Audit date: 2026-11-26
Scope: entire tracked repository (frontend, backend, migrations, tests, docs, deployment, assets, local dev logs). No secret values are reproduced in this report.

## 1. Architecture map

### Root
- `frontend/` — Next.js 15 / React 19 / TypeScript / Tailwind App Router client.
- `backend/` — FastAPI application, SQLAlchemy ORM, Alembic migrations, Pydantic schemas, pytest suite.
- `docs/` — architecture and API contract notes.
- `scripts/start-local.ps1` — local dev launcher with log redirection.
- `docker-compose.yml` — local/reference PostgreSQL + backend + frontend stack.
- `render.yaml`, `vercel.json` — two separate deployment paths.
- `.dev-logs/` — ignored dev-server logs.
- `.env.example`, `backend/.env.example`, `frontend/.env.example` — tracked placeholders. Local `.env` files are ignored.

### Backend flow
- `backend/app/main.py` — app factory, middleware (request ID, timing, security headers), exception handlers, startup Alembic migrations followed by readiness check, expired face-embedding purge, background scheduled-export runner, router registration.
- `backend/app/api/v1/router.py` — mounts all endpoints under `/api/v1`.
- `backend/app/api/v1/endpoints/` — auth, admin, academic, attendance, corrections, profile, professor tools, sessions, face, reports, timetable.
- `backend/app/core/` — config, security (bcrypt, JWT, Fernet), RBAC dependencies, error envelopes, rate limiting, proxy handling.
- `backend/app/models/` — users, profiles, academic structure, enrollments, sessions, attendance records, face embeddings, consent, audit logs, refresh tokens, timetable, correction requests, bulk uploads, report presets, scheduled exports/runs.
- `backend/app/services/` — attendance, face, location, QR, reports, corrections, certificates, timetable logic.
- `backend/alembic/versions/` — seven migrations (`0001`–`0007`); head `b4e2f6a9c7d1`.

### Frontend flow
- `frontend/app/(dashboard)/layout.tsx` — client-side auth/role guard and shell.
- `frontend/components/layout/dashboard-shell.tsx` — sidebar, topbar, mobile sheet.
- `frontend/lib/api.ts` — in-memory access token, refresh-cookie flow, one retry on 401, typed API helpers, blob downloads.
- `frontend/lib/auth-context.tsx` — auth bootstrap, login/register/logout, unauthorized event.
- `frontend/lib/normalize.ts` — backend-to-UI contract adapters.
- `frontend/lib/hooks.ts` — `useResource` load/reload state.
- Feature pages: admin CRUD/timetable/reports/audit/faces/correction reviews/bulk import wizard; professor classes/students/sessions/history/reports/correction reviews/at-risk; student classes/schedule/QR/face/history/correction requests/profile/privacy.

### Data and auth flow
Browser → Next client → REST `/api/v1` → FastAPI endpoint → RBAC dependency → service → SQLAlchemy model → DB. Access token is held in memory; refresh token is an HttpOnly cookie scoped to `/api/v1/auth`. Authorization checks use the database `User.role`, not the JWT role claim.

## 2. Baseline verification (before changes)

| Check | Command | Result |
|---|---|---|
| Backend tests | `py -m pytest -q` | 40 passed; 1 Starlette/httpx deprecation warning |
| Backend lint | `py -m ruff check app tests` | All checks passed |
| Frontend lint | `npm run lint` | Passed |
| Frontend typecheck | `npx tsc --noEmit` | Passed |
| Frontend production build | `npm run build` | Passed, 34 routes generated |

Git state at audit start: clean on `main`, tracking `origin/main`.

## 3. Verified problems

Severity: P0 critical/security, P1 high, P2 medium, P3 low.

| ID | Severity | Location | Root cause | User impact | Classification |
|---|---|---|---|---|---|
| A-01 | P1 | `frontend/lib/api.ts` callers with `page_size: 200` in 15 places | Backend caps most paginated endpoints at `le=100` (`backend/app/schemas/common.py:25`) | Recurring 422s in logs; list data may be truncated | FIX |
| A-02 | P1 | `frontend/app/(dashboard)/professor/students/page.tsx:53-56` | `ClassAttendanceOut.roster` normalized as paginated attendance records | Professor student roster renders empty | FIX |
| A-03 | P1 | `frontend/app/(dashboard)/professor/sessions/[id]/page.tsx:93-100` | `Page[RosterEntry]` normalized with `normalizeAttendance`; missing status defaults to `present` | Unmarked students appear present; correction action has no record ID | FIX |
| A-04 | P1 | `frontend/lib/normalize.ts:749-806` + admin/professor dashboards | Normalizers expect flat fields; backend returns nested `counts`/`attendance`; rate is 0–1 fraction | Dashboard stats show zeros or 1% | FIX |
| A-05 | P1 | `frontend/lib/normalize.ts:809-831` + student dashboard | `totals.average_percentage` ignored; no backend `today_classes`/`trend` | Overall attendance shows 0%; empty sections | FIX |
| A-06 | P1 | `frontend/lib/normalize.ts:834-852` + student history | Page envelope discarded before `normalizePaginated`; no overall percentage | Pagination always shows one page; overall donut 0% | FIX |
| A-07 | P1 | `frontend/lib/normalize.ts:854-870` + `ReportViewer` | `by_status`, `groups` and fractional `attendance_rate` not mapped | Report charts empty; 0.8 displays as 1% | FIX |
| A-08 | P2 | `frontend/app/(dashboard)/admin/audit-logs/page.tsx` + `normalizeAuditLog` | Reads `actor_id`/`before`/`after`; backend sends `actor_user_id`/`before_json`/`after_json` | Actor always “System”; diff JSON always `{}` | FIX |
| A-09 | P1 | `frontend/app/(dashboard)/admin/holidays/page.tsx:67-73` | Expects array and sends `page_size=500`; backend returns `Page[HolidayOut]` with max 100 | 422 or runtime `.map()` failure | FIX |
| A-10 | P2 | Professor history reason column | `ReportRecordOut` omits `correction_reason` | Reason column always `—` | FIX (additive backend field) |
| A-11 | P0 | Face verification | Descriptors and movement centers are client-supplied; no server-side model/liveness | Determined client can spoof face verification | DOCUMENT/REBUILD; not claimed as fixed |
| A-12 | P0 | Geolocation verification | Coordinates and accuracy are client-reported | Determined client can spoof location | DOCUMENT/REBUILD; not claimed as fixed |
| A-13 | P1 | `backend/app/core/rate_limit.py:14` | Process-local `memory://` limiter | Limits are not shared across workers/replicas | IMPROVE |
| A-14 | P1 | `render.yaml` | No pre-deploy migration; Dockerfile CMD only starts Uvicorn | Fresh Render DB may fail readiness guard | FIX |
| A-15 | P2 | `backend/Dockerfile`, `requirements-face.txt`, `docker-compose.yml`, `docs/architecture.md` | Retired InsightFace worker stack still installed/downloaded/documented | Larger image, slower builds, misleading docs | REMOVE stale config / UPDATE docs |
| A-16 | P2 | `vercel.json:22-33` | Explicit face rewrites duplicate generic `/api/(.*)` | Maintenance confusion | REMOVE redundant rules |
| A-17 | P2 | Root `.gitignore:25,36` | Re-include before ignore; example files only tracked because already added | Future example files may be ignored | FIX |
| A-18 | P2 | `components/auth/auth-guard.tsx` | Duplicate guard; dashboard layout has its own guard | Logic can drift | MERGE or REMOVE after reference check |
| A-19 | P2 | `components/ui/stat-card.tsx` vs `components/dashboard/stat-card.tsx` | Two stat-card implementations | Duplicate UI language | MERGE after usage check |
| A-20 | P3 | Dev logs | Stale `.next` artifacts caused historical 500s; current build passes | Historical only | KEEP evidence, no code change |
| A-21 | P1 | Public privacy/trust documentation | Consent/deletion mechanics exist but no published biometric/geolocation policy, retention schedule, or accessibility statement | Legal/trust gap vs competitors | ADD documentation |

## 4. Stale/dev-log evidence

- 12 logical 422 events for `GET /professor/classes?page_size=200` (duplicated in stdout/stderr).
- 11 protected-route/refresh 401 lines; consistent with normal token expiry/refresh churn.
- One historical `admin/face/status` 404, fixed by later commit.
- Frontend `.err.log` had stale Next manifests/chunks and `/login` or `/` 500s on 2026-11-25; no 500 after later recompiles, and a clean production build now passes.

## 5. Competitor comparison (verified official sources)

Industry: education attendance operations for universities/colleges — role-based classes, timetables, QR/face check-in, geolocation, reports.

| Dimension | This project | Canvas Roll Call | Moodle Attendance | Teams Education | PowerSchool SIS | Infinite Campus | ClassDojo | Jibble | Hikvision |
|---|---|---|---|---|---|---|---|---|---|
| Primary market | Higher-ed attendance | LMS | LMS plugin | Meetings | K-12 SIS | K-12 SIS | K-12 family | Workforce time | Campus hardware |
| QR check-in | Yes | Not found | Yes | Not found | Not found | Check-in links | Not core | Yes | Card/face |
| Biometric face | Yes, browser descriptors | Not found | Not found | Not found | Not found | Not found | Not found | Yes | Yes |
| Liveness/anti-spoof | Movement heuristic | Not found | Not found | Not found | Not found | Not found | Not found | Kiosk claim | Vendor claim |
| Geolocation | Yes | Not found | Subnet/IP | Not found | Not found | Not found | Not found | GPS/geofence | Physical gates |
| Rich statuses/codes | Partial | Present/late/excused | Configurable | Join/duration | Custom codes | P/A/T + time | SIS-synced | Clock policies | Statuses |
| Time-based attendance | Not found | Not found | Not found | Duration | Yes | Yes | Not found | Timesheets | Terminals |
| Reports/export | XLSX/PDF | CSV email | Class/student | CSV/Excel | Custom | Reports | Dashboards | Analytics | 10–15 report types |
| Accessibility proof | Not found in repo | VPAT/WCAG 2.2 | VPAT/WCAG 2.2 | MS ecosystem | Buying guide | Policy | WCAG 2.1 goal | Not found | Cert pages |
| Native mobile | Not found | Strong | Strong | Strong | Family app | Family app | Strong | Strong | Remote check-in |
| Trust/privacy docs | Mechanics only | Trust Center | VPAT | Retention policy | Security claims | Privacy policy | Privacy page | Controller/processor | Certifications |

Sources include official docs/pages for Instructure Canvas, Moodle, Microsoft Learn/Support, PowerSchool, Infinite Campus, ClassDojo, Jibble, and Hikvision. Full URL list is retained in the research deliverable; no unverified feature is claimed as present.

### Worth adopting
- Student-facing attendance report with clear privacy boundaries.
- Date/SIS-ID filters and portable CSV/export fields.
- Configurable statuses/codes and comments.
- Positive/time-based attendance for labs and partial attendance.
- QR rotation, password fallback, expiry, shared-device heuristics.
- Biometric enrollment quality guidance and mismatch policy.
- Formal privacy, retention, accessibility, and security documentation.
- Mobile-first student check-in/history.

### Not a good fit
- Payroll/timesheet/overtime and productivity screenshots.
- K-12 behavior points/family engagement surface.
- Hardware-bound access control as the primary model.
- Public gate/dormitory face recognition.
- LMS gradebook scoring as a default.
- Unverified certification badges or vendor marketing metrics.

## 6. Missing-feature priorities

- **P0** Biometric/geolocation transparency, consent/retention policy, accessibility statement, honest liveness limitations.
- **P1** Fix broken dashboards/rosters/reports; custom statuses/comments; positive attendance; QR rotation/password fallback; mobile strategy; SSO/roster integration path.
- **P2** Attendance alerts, trend dashboards, at-risk indicators with human review, LMS/SIS integration roadmap.
- **P3/P4** Native apps, advanced analytics, experiments — only after core reliability and trust work.

## 7. Implementation roadmap

Stage 1 (P0/P1 correctness): normalize contract fixes, page-size helper, roster fixes, holidays fix, report/dashboard/audit mapping, additive correction reason.
Stage 2 (security/config/docs): Render migration/health, stale face worker dependencies/volumes/docs, redundant Vercel rewrites, `.gitignore`.
Stage 3 (quality/debt): duplicate guard/stat-card review, optional shared rate-limit storage.
Stage 4 (product): privacy/accessibility docs and prioritized feature discovery.

Initial `AUDIT.md` written before implementation. Results and actual test outputs are appended below.

## 8. Implementation results

### Completed fixes

- **A-01/A-09**: added `api.getAll()` in `frontend/lib/api.ts` and replaced all frontend requests above the backend limit with paginated all-row loading. No `page_size` greater than 100 remains in frontend source.
- **A-02/A-03**: professor student roster and session monitor now normalize `ClassAttendanceOut.roster` / `Page[RosterEntry]`, preserve unmarked students, and only enable correction for records that have an ID.
- **A-04/A-05/A-06/A-07**: admin, professor, student, attendance-summary, and report normalizers now read nested backend shapes, convert 0–1 rates to percentages, map report status/group data, derive overall percentages, and keep page envelopes intact.
- **A-08**: audit-log normalizer now reads `actor_user_id`, `before_json`, and `after_json`.
- **A-10**: added `correction_reason` to `ReportRecordOut` and `record_to_report()`.
- **A-13**: added configurable `RATE_LIMIT_STORAGE_URI`; deployments can use `redis://...` for shared limits. Default remains process-local storage.
- **A-14**: API now runs Alembic migrations at FastAPI startup via `run_database_migrations()` using the running API's `DATABASE_URL`, then checks readiness; the Docker/Render command no longer invokes the Alembic CLI before Uvicorn, and the host's `PORT` is honored.
- **A-15**: removed stale InsightFace requirements, model download, image libraries, and `face_models` volume. Updated README and architecture docs to describe browser-side `face-api.js` processing.
- **A-16**: removed redundant face-specific Vercel rewrites.
- **A-17**: fixed `.gitignore` ordering so `!**/.env.example` takes effect.
- **A-18**: removed unused `AuthGuard`.
- **A-19**: retained both stat-card components after confirming both are used.
- **A-21**: added `docs/privacy-and-accessibility.md` with biometric, geolocation, consent, retention, deletion, deployment, and accessibility limitations.

### Verification executed after implementation

- `py -m pytest -q` in `backend`: `40 passed`; one pre-existing `StarletteDeprecationWarning` about `httpx`/`starlette.testclient`.
- `py -m ruff check app tests` in `backend`: `All checks passed!`
- `npm run lint` in `frontend`: passed with zero warnings.
- `npx tsc --noEmit` in `frontend`: passed. An earlier parallel run overlapped `next build` regenerating `.next/types` and produced transient `TS6053` errors; a sequential rerun after the build passed.
- `npm run build` in `frontend`: passed with Next.js 15.5.29; compiled successfully and generated all 34 routes.
- `node -e "JSON.parse(...)"` on `vercel.json`: valid JSON.
- `git diff --check`: no whitespace errors; only LF-to-CRLF working-tree warnings from Windows checkout behavior.

### Files changed

- Frontend API/normalizers: `frontend/lib/api.ts`, `frontend/lib/normalize.ts`.
- Frontend pages/components: `frontend/app/(dashboard)/admin/classes/page.tsx`, `frontend/app/(dashboard)/admin/courses/page.tsx`, `frontend/app/(dashboard)/admin/faculty-assignments/page.tsx`, `frontend/app/(dashboard)/admin/holidays/page.tsx`, `frontend/app/(dashboard)/admin/semesters/page.tsx`, `frontend/app/(dashboard)/admin/student-faces/page.tsx`, `frontend/app/(dashboard)/admin/subjects/page.tsx`, `frontend/app/(dashboard)/admin/timetable/page.tsx`, `frontend/app/(dashboard)/professor/classes/page.tsx`, `frontend/app/(dashboard)/professor/history/page.tsx`, `frontend/app/(dashboard)/professor/sessions/page.tsx`, `frontend/app/(dashboard)/professor/sessions/[id]/page.tsx`, `frontend/app/(dashboard)/professor/students/page.tsx`, `frontend/app/(dashboard)/student/classes/page.tsx`, `frontend/app/(dashboard)/student/page.tsx`, `frontend/app/(dashboard)/student/schedule/page.tsx`, `frontend/components/reports/report-viewer.tsx`.
- Backend: `backend/app/api/v1/endpoints/admin.py`, `backend/app/api/v1/endpoints/attendance.py`, `backend/app/core/config.py`, `backend/app/core/rate_limit.py`, `backend/app/schemas/reports.py`, `backend/app/services/report_service.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/Dockerfile`.
- Config/docs: `.env.example`, `.gitignore`, `README.md`, `backend/.env.example`, `docker-compose.yml`, `docs/api-contract.md`, `docs/architecture.md`, `render.yaml`, `vercel.json`.
- Deleted: `backend/requirements-face.txt`, `frontend/components/auth/auth-guard.tsx`.
- Added: `docs/privacy-and-accessibility.md`, `AUDIT.md`.

### Remaining limitations

- **A-11/A-12** are documented, not fixed: face descriptors/centers and geolocation are client-supplied; strong server-side biometric/location verification would require a different architecture.
- Rate limiting is only shared when `RATE_LIMIT_STORAGE_URI` points to a working Redis instance; this was not validated against a live deployment.
- No live Render/Vercel deployment was exercised; Render documentation fetches failed with transport errors during research.
- Competitor research used official vendor pages, but exact URLs were not retained in session notes; re-source them before publishing externally.
- No browser-level end-to-end check was run against seeded data; verification is static analysis, unit tests, lint, typecheck, and production build.

## 9. Feature foundation and user workflows (2026-11-27)

### Migration and models

- `backend/alembic/versions/0007_feature_foundation.py`: revision `b4e2f6a9c7d1`, down revision `9c2f7a4b81d3`, new Alembic head. Adds `attendance_correction_requests` (partial unique index for one pending request per student/session), `bulk_import_uploads`, `report_presets`, `scheduled_report_exports`, and `scheduled_export_runs`, with matching ORM models.

### Backend endpoints (all under `/api/v1`)

- Corrections: `POST /attendance/correction-requests`, `GET /attendance/correction-requests/me`, `GET /attendance/correction-requests`, `POST /attendance/correction-requests/{request_id}/review`, `POST /attendance/correction-requests/{request_id}/withdraw`. `session_id` is required and `record_id` is optional for missing records. Professor/admin review writes audit entries; approval creates or updates the attendance record, and rejection requires `review_note`.
- Student self-service: `GET`/`PATCH /me/profile`, `GET`/`POST /me/consent`, `GET /face/me/export`, `GET /me/alerts`, `GET /attendance/me/certificate?format=pdf|xlsx&...`.
- Professor tools: `GET /sessions/{session_id}/attendance/missing`, `POST /sessions/{session_id}/attendance/mark-absent`, `GET /professor/classes/risk`.
- Bulk import: `GET /admin/users/bulk/template`, `POST /admin/users/bulk/preview`, `POST /admin/users/bulk`, `GET /admin/users/bulk/uploads`, `GET /admin/users/bulk/uploads/{upload_id}/errors.csv`. Multipart field is `file`; upload history and errors are persisted.
- Reports: `GET`/`POST /reports/presets`, `DELETE /reports/presets/{id}`, `GET`/`POST /reports/scheduled-exports`, `PATCH`/`DELETE /reports/scheduled-exports/{id}`, `POST /reports/scheduled-exports/{id}/run`, `GET /reports/scheduled-exports/runs`, `GET /reports/scheduled-exports/runs/{id}/download`. Run history and files are stored in-app; there is no email delivery.

### Frontend

- Added student correction requests/profile/privacy pages, professor correction reviews and at-risk classes pages, an admin correction reviews page, a bulk import wizard in admin users, and report presets/scheduled exports tabs in the report viewer. Role-aware navigation entries and topbar alerts via `/me/alerts` were added.

### Verification executed for this feature set

- `py -m pytest -q` in `backend`: 48 passed.
- `py -m ruff check app tests` in `backend`: passed.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` in `frontend`: passed.

### Scope notes

- No live deployment or browser-level end-to-end run was performed for this feature set; scheduled exports do not send email.

## 10. Final follow-up changes

- **Presets**: added `PATCH /reports/presets/{preset_id}`. Setting `is_default: true` clears the caller's other defaults in one commit and records the cleared IDs in the audit entry; the frontend now uses PATCH instead of delete/recreate for default selection.
- **Report filters**: `ReportFilterIn` and frontend `ReportFilter` accept `class_id`; it reaches report generation and can be saved in presets and scheduled exports. The scheduled-export UI no longer offers an ineffective "Group by" filter.
- **Run history**: `GET /reports/scheduled-exports/runs` now returns `Page[ScheduledExportRunOut]` with `page`/`page_size` and optional `schedule_id` filtering.
- **Automatic execution**: `backend/app/main.py` starts a background task in non-test environments that processes due active schedules every 60 seconds (up to 20 per pass) and stores runs; manual `POST /reports/scheduled-exports/{id}/run` remains available.
- **Attendance history/alerts**: `GET /attendance/me` accepts optional `search` and returns `class_id`, `class_name`, `course_id`, and `course_name` on records. Topbar alert links with `?search=` now prefill the admin users table search.
- **Corrections**: approval preserves an existing attendance record's method when no `final_method` is supplied; new records still use `manual`.

### Verification

- `py -m pytest -q` in `backend`: 57 passed; `py -m ruff check app tests`: clean.
- Frontend `npm run lint`, `npx tsc --noEmit`, and `npm run build`: all passed; `npm run build` generated 40 static pages with `/professor/sessions/[id]` dynamic.

## 11. Deployment migration timing

- `backend/app/main.py` calls `run_database_migrations()` during FastAPI startup in non-test environments, then `verify_database_readiness()` only checks the database and `alembic_version` afterward. Migrations use the same `DATABASE_URL` as the running API.
- Docker/Render CMD no longer runs `alembic upgrade head` before Uvicorn; Uvicorn startup handles migrations.
- Vercel's `buildCommand` in `vercel.json` is now an echo instead of `alembic upgrade head`. Build-time migrations targeted a different/ephemeral database and caused `Database has not been migrated` at runtime.
- `DATABASE_URL` must point to the production PostgreSQL database used at runtime; if it is missing or wrong, startup fails with a config/migration error. All other deployment guidance remains unchanged.
- On Vercel production, `backend/sitecustomize.py` clears `VERCEL_IPC_PATH` at interpreter startup so the platform-generated `vc__handler__python.py` can import `vc_handler` from `vercel_runtime.vc_init` under the current Vercel Python runtime. Without it, API requests fail before app code runs with `ImportError: cannot import name 'vc_handler'` and HTTP 500. Development/preview is unchanged because the shim only acts when `VERCEL_ENV=production`.

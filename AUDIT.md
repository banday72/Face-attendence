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
- `backend/app/main.py` — app factory, middleware (request ID, timing, security headers), exception handlers, readiness guard, expired face-embedding purge, router registration.
- `backend/app/api/v1/router.py` — mounts all endpoints under `/api/v1`.
- `backend/app/api/v1/endpoints/` — auth, admin, academic, attendance, sessions, face, reports, timetable.
- `backend/app/core/` — config, security (bcrypt, JWT, Fernet), RBAC dependencies, error envelopes, rate limiting, proxy handling.
- `backend/app/models/` — users, profiles, academic structure, enrollments, sessions, attendance records, face embeddings, consent, audit logs, refresh tokens, timetable.
- `backend/app/services/` — attendance, face, location, QR, reports, timetable logic.
- `backend/alembic/versions/` — six migrations (`0001`–`0006`); head `9c2f7a4b81d3`.

### Frontend flow
- `frontend/app/(dashboard)/layout.tsx` — client-side auth/role guard and shell.
- `frontend/components/layout/dashboard-shell.tsx` — sidebar, topbar, mobile sheet.
- `frontend/lib/api.ts` — in-memory access token, refresh-cookie flow, one retry on 401, typed API helpers, blob downloads.
- `frontend/lib/auth-context.tsx` — auth bootstrap, login/register/logout, unauthorized event.
- `frontend/lib/normalize.ts` — backend-to-UI contract adapters.
- `frontend/lib/hooks.ts` — `useResource` load/reload state.
- Feature pages: admin CRUD/timetable/reports/audit/faces; professor classes/students/sessions/history/reports; student classes/schedule/QR/face/history.

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
- **A-14**: API container now runs `alembic upgrade head` before Uvicorn and honors `PORT` from the host.
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

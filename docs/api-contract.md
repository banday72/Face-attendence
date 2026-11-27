# University Smart Attendance System — API Contract (v1)

Base URL: `/api/v1`

The FastAPI application publishes an authoritative OpenAPI document at `/openapi.json` and a human-readable explorer at `/docs`. This file records the intended contract and business rules; OpenAPI is generated from the implementation and is the machine-readable source of truth.

## Conventions

- JSON request and response bodies unless noted.
- URI versioning: `/api/v1`. Additive fields are compatible; removing/renaming fields or changing auth requirements requires `/api/v2`.
- Authentication: `Authorization: Bearer <access_token>` for protected operations. The refresh endpoint uses an HttpOnly cookie.
- Students may create only their own check-in records via QR/face endpoints. They cannot create, edit, or correct records for anyone else directly; they may request a correction for their own session through the correction workflow.
- Errors use one shape: `{ "error": { "code": "string_code", "message": "Human readable", "details": {}, "request_id": "uuid" } }`.
- Common codes: `validation_error`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `session_expired`, `location_out_of_range`, `face_verification_failed`, `duplicate_attendance`.
- Paginated collections use `?page=1&page_size=20`; `page_size` accepts 1–100 and returns `{ "items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0 }`. Clients that need more than 100 rows must follow `page`/`pages`.
- Filtering uses explicit parameters such as `department_id`, `course_id`, `class_id`, `student_id`, `from_date`, `to_date`, `status`, `search`. Sorting uses `sort_by` and `sort_order`.
- Successful creates return `201`; deletes return `204`; idempotent updates return `200`.

## Roles

`admin`, `professor`, `student`. Role is enforced server-side on every protected route. Students may only create their own check-in records through the QR and face endpoints; they may submit and withdraw correction requests for their own sessions, but cannot write attendance records directly. Professors can only write records for classes assigned to them. Admins can manage the entire system but cannot grant themselves attendance as a student.

## Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Student self-registration; university ID must be unique |
| POST | `/auth/login` | public | Returns an access token plus user profile and sets a rotating HttpOnly refresh cookie |
| POST | `/auth/refresh` | refresh cookie | Rotates refresh token and returns a new access token plus user profile |
| POST | `/auth/logout` | refresh cookie | Revokes refresh token |
| GET | `/auth/me` | authenticated | Current user profile and role |

## Admin management

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | System-wide counts and attendance statistics |
| GET | `/admin/alerts` | Attendance and active-session alerts for the notification bell |
| GET, POST | `/admin/departments` | List/create departments |
| GET, PATCH, DELETE | `/admin/departments/{id}` | Manage department |
| GET, POST | `/admin/users` | List/create users of any role; professor/student create requires role-specific IDs |
| GET | `/admin/users/bulk/template` | Download a CSV template with headers and a sample row |
| POST | `/admin/users/bulk/preview` | Validate a CSV without creating users; returns totals, samples, and per-row errors |
| POST | `/admin/users/bulk` | Upload a UTF-8 CSV (max 500 rows) to create users; returns per-row results and an `upload_id` |
| GET | `/admin/users/bulk/uploads` | Paginated bulk-upload history with actor, filename, and totals |
| GET | `/admin/users/bulk/uploads/{upload_id}/errors.csv` | Download the stored per-row errors for one upload as CSV |
| GET, PATCH, DELETE | `/admin/users/{id}` | Manage user account, including role-specific profile fields |
| POST | `/admin/users/{id}/reset-password` | Reset a professor/student password and revoke active refresh sessions |
| GET | `/admin/professors` | Professor options keyed by professor profile ID |
| GET | `/admin/students` | Student options keyed by student profile ID |
| GET, POST | `/admin/semesters` | List/create semesters; only one can be active |
| GET, PATCH, DELETE | `/admin/semesters/{id}` | Manage semester; referenced semesters cannot be deleted |
| GET | `/admin/faculty` | Faculty roster with course and class counts |
| GET, POST | `/admin/courses` | List/create courses; `department_id` is required |
| GET, PATCH, DELETE | `/admin/courses/{id}` | Manage course |
| GET, POST, DELETE | `/admin/courses/{id}/professors` | List/assign/unassign professors for a course |
| GET, POST | `/admin/classes` | List/create class sections; `professor_id` is the primary professor profile ID |
| GET, PATCH, DELETE | `/admin/classes/{id}` | Manage class section |
| GET, POST | `/admin/classes/{id}/professors` | List/add professors with access to a class |
| DELETE | `/admin/classes/{id}/professors/{professor_id}` | Remove a professor from a class |
| POST | `/admin/classes/{id}/enrollments` | Enroll a student; `student_id` is a student profile ID |
| DELETE | `/admin/classes/{id}/enrollments/{student_id}` | Unenroll a student |
| GET, POST | `/admin/schedules` | List/create legacy weekly timetable entries |
| GET, PATCH, DELETE | `/admin/schedules/{id}` | Manage legacy weekly timetable entry |
| GET | `/admin/timetable` | Materialized timetable entries with `view=day\|week\|month\|list` and filters |
| GET | `/admin/timetable/summary` | Schedule rule, today/upcoming class, and conflict counts |
| GET | `/admin/timetable/conflicts` | Current conflicts across all schedule rules |
| POST | `/admin/timetable/schedules` | Create a recurring schedule group |
| GET, PATCH, DELETE | `/admin/timetable/schedules/{id}` | Manage a recurring schedule group |
| POST | `/admin/schedules/check-conflicts` | Validate a proposed rule without saving it |
| GET, POST | `/admin/subjects` | List/create subjects with semester and faculty links |
| GET, PATCH, DELETE | `/admin/subjects/{id}` | Manage subject and its links |
| PUT | `/admin/subjects/{id}/semesters` | Replace eligible semesters |
| PUT | `/admin/subjects/{id}/professors` | Replace eligible faculty |
| GET, POST | `/admin/classrooms` | List/create classrooms with capacity and room type |
| GET, PATCH, DELETE | `/admin/classrooms/{id}` | Manage classroom |
| GET, POST | `/admin/holidays` | List/create academic holidays and closures |
| GET, PATCH, DELETE | `/admin/holidays/{id}` | Manage holiday |
| GET | `/admin/departments/{id}/details` | Department teachers, subjects, classes, and semesters |
| GET, PATCH | `/admin/faculty/{id}` | Faculty detail/update |
| GET | `/admin/faculty/{id}/classes` | Classes assigned to a faculty member |
| GET | `/admin/faculty/{id}/timetable` | Timetable for a faculty member |
| GET | `/admin/face/status/{student_id}` | Registration status; accepts a student profile ID or its user ID |
| POST | `/admin/face/register/{student_id}` | Register a student's face with explicit admin-recorded consent; accepts a student profile ID or its user ID |
| GET | `/admin/audit-logs` | Query modification history |

Professor and student option endpoints return profile IDs, not user account IDs; use those IDs for course assignments, class sections, and enrollments. Course-professor assignments are catalog metadata; attendance permissions are scoped by the class section's primary professor plus any professor in `/admin/classes/{id}/professors`. Bulk import endpoints take a multipart form with field `file`; preview masks passwords in samples, and completed uploads are stored in `bulk_import_uploads` with per-row errors retained for CSV download.

Class sections require a `semester_id` or a `term`; when both are supplied the semester name is used as the normalized term. `GET /semesters` returns semester options for selectors. Semester date ranges are validated, and activating a semester deactivates all others.

Legacy weekly timetable entries use `day_of_week` `0=Monday` through `6=Sunday`, plus `start_time`, `end_time`, and an optional `classroom_id`; the pair `(class_id, day_of_week, start_time)` is unique. `end_time` must be later than `start_time`. The full timetable module adds `recurrence_type` (`one_time`, `daily`, `weekly`, `monthly`, `custom`, `semester`), `days_of_week`, `start_date`/`end_date`, `custom_dates`, `holiday_dates`, `exclude_holidays`, `monthly_mode`, `class_type`, and optional department/semester/subject/faculty/room IDs. Multiple weekdays create multiple schedule rows sharing a `schedule_group_id`; edits and deletes apply to the whole group. Occurrences are materialized on read, so student-facing schedule data continues to read the underlying `schedules` table. Blocking conflicts are teacher, classroom, student-group, and semester-range overlaps; capacity shortfalls are warnings. `POST /admin/schedules/check-conflicts` returns `{ valid, conflicts, occurrence_count }` without saving.

## Academic shared endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/departments` | authenticated | Department options |
| GET | `/semesters` | authenticated | Semester options with active/current flags |
| GET | `/courses` | authenticated | Course options |
| GET | `/classrooms` | authenticated | Classroom options with location config |
| GET | `/professor/classes` | professor | Assigned classes |
| GET | `/student/classes` | student | Enrolled classes |
| GET | `/student/schedule` | student | Weekly timetable for enrolled classes |

## Sessions and QR attendance

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/sessions` | professor/admin | Paginated session list with `class_id` and `status` filters; professors see only owned classes |
| POST | `/sessions` | professor/admin | Create a session with class, classroom, `starts_at`, `ends_at`, lateness, QR refresh, and face/location policy |
| GET | `/sessions/{id}` | owner/admin | Session detail and live counts |
| POST | `/sessions/{id}/start` | owner/admin | Opens a session and generates the first opaque QR token |
| POST | `/sessions/{id}/qr/refresh` | owner/admin | Invalidates old token and returns a new QR payload |
| POST | `/sessions/{id}/close` | owner/admin | Closes session, blocks check-ins, and marks absent students |
| GET | `/sessions/{id}/attendance` | owner/admin | Paginated live attendance roster |
| GET | `/sessions/active` | student | Active sessions for enrolled classes |
| POST | `/attendance/qr` | student | `{ "token": "...", "latitude": 0, "longitude": 0, "accuracy": 0 }` |

QR payload contains only a versioned, random token (`uat:v1:<token>`). The database stores a SHA-256 hash of the token. Tokens are single-purpose, expire, are rotated on refresh, and are validated entirely on the backend. `qr_validity_seconds` has a 300-second (5-minute) minimum; the default is 300 seconds. Each token may be used only once per student per session. Enrollment, session state, expiry, and classroom radius are checked server-side.

Location results are `verified`, `out_of_range`, `unavailable`, or `not_required`. `require_location` applies to both QR and face check-ins; out-of-range check-ins are rejected with `403 location_out_of_range`. QR check-ins send location fields with the token; face check-ins send the same fields alongside frames. `latitude`, `longitude`, and `accuracy` are optional when a session does not require location. GPS is treated as one signal, not proof of presence; short-lived tokens and active liveness checks are additional signals.

## Professor tools

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/sessions/{session_id}/attendance/missing` | professor/admin | Enrolled students with no attendance record in the session |
| POST | `/sessions/{session_id}/attendance/mark-absent` | professor/admin | Mark all missing students absent and return marked IDs/count |
| GET | `/professor/classes/risk` | professor/admin | Per-class counts and attendance rate with at-risk student count |

Session-scoped operations require ownership of the session's class. The at-risk view covers classes owned by the professor (all classes for admins); a student is counted as at risk after at least three records with fewer than 75% `present`/`late`.

## Face registration and attendance

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/face/status` | student | Registration status and consent metadata |
| POST | `/face/register` | student | `{ "consent_version": "1.0", "descriptors": [[...128 numbers...]], "centers": [[x, y]] }` |
| DELETE | `/face/me` | student | Delete all biometric embeddings and consent |
| GET | `/admin/face/status/{student_id}` | admin | Registration status; accepts a student profile ID or its user ID |
| POST | `/admin/face/register/{student_id}` | admin | `{ "consent_version": "1.0", "descriptors": [[...128 numbers...]], "centers": [[x, y]], "consent_confirmed": true, "consent_reference": "form-123" }`; accepts a student profile ID or its user ID |
| POST | `/attendance/face` | student | `{ "session_id": "...", "descriptors": [[...128 numbers...]], "centers": [[x, y]], "challenge": "turn_left", "latitude": 0, "longitude": 0, "accuracy": 0 }` |

All face endpoints are served by the main API. The browser generates 128-d descriptors with `face-api.js`; the API never receives image frames. Authentication, consent, audit logging, liveness checks, encrypted embeddings, and matching stay in the main API.

The challenge is a server-configured value from `turn_left`, `turn_right`, or `blink`. Descriptor vectors are finite 128-number arrays, each paired with an `[x, y]` face center. Descriptors are encrypted at rest with Fernet. Registration requires at least three valid descriptors with evidence of center movement, rejects duplicate matches against other students, and replaces prior embeddings after successful re-registration. Student self-registration records the student's explicit consent; admin-on-behalf registration requires `consent_confirmed: true` and an auditable consent reference, and writes an audit entry naming the admin actor and student. Attendance face verification requires active consent at the current policy version, an active session, enrollment, the active liveness challenge, required location verification, a score above the configured threshold, and no existing record for that session. Browser-side matching is spoofable by modified client code; liveness checks are heuristics, and a professor/manual correction path exists for students unable to use biometrics.

## Student self-service

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET, PATCH | `/me/profile` | authenticated | Read/update name, phone, and role-specific profile fields |
| GET, POST | `/me/consent` | student | Read biometric consent status or accept the current version |
| GET | `/face/me/export` | student | Export decrypted descriptors, embeddings, and consent metadata |
| GET | `/me/alerts` | authenticated | Role-aware attendance, consent, and active-session alerts |
| GET | `/attendance/me/certificate` | student | Attendance certificate or detailed export (`format=pdf\|xlsx`) |

`POST /me/consent` accepts an optional `consent_version` and rejects versions other than the configured current version. Certificate filters are `from_date`, `to_date`, and `course_id`; `include_details=true` returns the detailed PDF/XLSX export instead of the summary PDF. Profile updates, consent acceptance, face-data export, and certificate export write audit log entries.

## Attendance

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/attendance/me` | student | Paginated personal attendance history with optional `search`, class/course labels, and course percentages |
| GET | `/attendance/classes/{class_id}` | student/professor/admin | Class roster and attendance summary |
| PATCH | `/attendance/{record_id}` | professor/admin | Correct status/method with required reason |
| GET | `/professor/dashboard` | professor | Assigned course, class, and attendance statistics |
| GET | `/professor/attendance/history` | professor | Filterable attendance history |
| GET | `/student/dashboard` | student | Enrollment percentages, warnings, recent activity |

`attendance_records` has a unique constraint on `(session_id, student_id)`. Closing a session creates absent records for enrolled students without a check-in. Every manual or administrative modification writes an audit log entry with actor, before/after values, reason, IP, and user agent. `GET /attendance/me` accepts optional `search` (course code/name or class section), and each returned record includes `class_id`, `class_name`, `course_id`, and `course_name`. Topbar alert links carrying `?search=` prefill the admin users table search.

### Attendance correction workflow

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/attendance/correction-requests` | student | Create a request with `session_id`, optional `record_id`, `requested_status`, and `reason` |
| GET | `/attendance/correction-requests/me` | student | Paginated list of the student's requests |
| GET | `/attendance/correction-requests` | professor/admin | Paginated review queue, scoped to owned classes |
| POST | `/attendance/correction-requests/{request_id}/review` | professor/admin | Approve or reject a pending request |
| POST | `/attendance/correction-requests/{request_id}/withdraw` | student | Withdraw the student's own pending request |

`record_id` may be omitted when no attendance record exists yet. `reason` is 10–500 characters; only one pending request is allowed per student and session (409 `conflict`). List filters are `status` (`pending|approved|rejected`), `from_date`, `to_date`, and `class_id` for the review queue; `page_size` accepts 1–100. Review takes `decision` (`approved|rejected`), optional `final_status`, optional `final_method`, and `review_note`; `review_note` is required for rejection. Approval creates the missing record when needed (method `manual`), otherwise updates the existing one and preserves its method when `final_method` is omitted. It writes audit entries for the decision and record change. Only pending requests can be reviewed or withdrawn.

## Reports and analytics

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/reports/summary` | admin/professor | Aggregates with `period=daily|weekly|monthly|course|student|professor|department` |
| GET | `/reports/records` | admin/professor | Filterable, sortable, paginated records; corrected rows include `correction_reason` |
| GET | `/reports/export` | admin/professor | `format=xlsx|pdf`; returns a file stream |
| GET, POST | `/reports/presets` | professor/admin | List/create named filter presets owned by the caller |
| PATCH | `/reports/presets/{preset_id}` | professor/admin | Update an owned preset; `is_default: true` clears other defaults |
| DELETE | `/reports/presets/{preset_id}` | professor/admin | Delete an owned preset |
| GET, POST | `/reports/scheduled-exports` | professor/admin | List/create owned export schedules |
| PATCH, DELETE | `/reports/scheduled-exports/{schedule_id}` | professor/admin | Update or delete an owned schedule |
| POST | `/reports/scheduled-exports/{schedule_id}/run` | professor/admin | Generate an export and store it as a run |
| GET | `/reports/scheduled-exports/runs` | professor/admin | Paginated in-app run history (`page`, `page_size`), optionally filtered by `schedule_id` |
| GET | `/reports/scheduled-exports/runs/{run_id}/download` | professor/admin | Download a stored run file |

Exports apply the same server-side filters and authorization as the report views. Preset names are unique per user. `PATCH /reports/presets/{preset_id}` updates a preset in place; when `is_default` is true, all other defaults for that user are cleared in the same commit and the cleared IDs are recorded in the audit entry. The frontend uses this PATCH to set a default rather than delete/recreate. `ReportFilterIn` and the frontend `ReportFilter` accept `class_id`, which is applied to generated exports and can be stored in presets and scheduled exports. Scheduled exports use `format=xlsx|pdf` (default `xlsx`) and `frequency=daily|weekly|monthly` (default `weekly`), store `next_run_at`/`last_run_at`, and recalculate `next_run_at` on updates. Runs are persisted in `scheduled_export_runs` with `status` (`ready` or `failed`), filename, content type, bytes, and error text; failed generation returns 503 `service_unavailable`. Run history uses the standard paginated envelope with `page`/`page_size`. In non-test environments a background task in `backend/app/main.py` checks due active schedules every 60 seconds and stores runs automatically, in addition to manual `POST /reports/scheduled-exports/{schedule_id}/run`. Run files are downloaded from in-app history only — there is no email delivery. The scheduled-export UI does not offer a `group_by` filter. Presets, schedules, and runs write audit log entries; other users' resources return 404.

## Operational

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness probe |
| GET | `/ready` | public | Database readiness probe |
| GET | `/openapi.json` | public | Generated API contract |

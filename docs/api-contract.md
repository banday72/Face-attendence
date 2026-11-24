# University Smart Attendance System — API Contract (v1)

Base URL: `/api/v1`

The FastAPI application publishes an authoritative OpenAPI document at `/openapi.json` and a human-readable explorer at `/docs`. This file records the intended contract and business rules; OpenAPI is generated from the implementation and is the machine-readable source of truth.

## Conventions

- JSON request and response bodies unless noted.
- URI versioning: `/api/v1`. Additive fields are compatible; removing/renaming fields or changing auth requirements requires `/api/v2`.
- Authentication: `Authorization: Bearer <access_token>` for protected operations. The refresh endpoint uses an HttpOnly cookie.
- Students may create only their own check-in records via QR/face endpoints. They cannot create, edit, or correct records for anyone else.
- Errors use one shape: `{ "error": { "code": "string_code", "message": "Human readable", "details": {}, "request_id": "uuid" } }`.
- Common codes: `validation_error`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `session_expired`, `location_out_of_range`, `face_verification_failed`, `duplicate_attendance`, `face_model_unavailable`.
- Paginated collections use `?page=1&page_size=20` and return `{ "items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0 }`.
- Filtering uses explicit parameters such as `department_id`, `course_id`, `class_id`, `student_id`, `from_date`, `to_date`, `status`, `search`. Sorting uses `sort_by` and `sort_order`.
- Successful creates return `201`; deletes return `204`; idempotent updates return `200`.

## Roles

`admin`, `professor`, `student`. Role is enforced server-side on every protected route. Students may only create their own check-in records through the QR and face endpoints; all other attendance writes and all corrections are forbidden. Professors can only write records for classes assigned to them. Admins can manage the entire system but cannot grant themselves attendance as a student.

## Authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Student self-registration; university ID must be unique |
| POST | `/auth/login` | public | Returns an access token and sets a rotating HttpOnly refresh cookie |
| POST | `/auth/refresh` | refresh cookie | Rotates refresh token and returns a new access token |
| POST | `/auth/logout` | refresh cookie | Revokes refresh token |
| GET | `/auth/me` | authenticated | Current user profile and role |

## Admin management

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | System-wide counts and attendance statistics |
| GET, POST | `/admin/departments` | List/create departments |
| GET, PATCH, DELETE | `/admin/departments/{id}` | Manage department |
| GET, POST | `/admin/users` | List/create users of any role |
| GET, PATCH, DELETE | `/admin/users/{id}` | Manage user account |
| GET, POST | `/admin/courses` | List/create courses |
| GET, PATCH, DELETE | `/admin/courses/{id}` | Manage course |
| GET, POST | `/admin/classes` | List/create classes |
| GET, PATCH, DELETE | `/admin/classes/{id}` | Manage class |
| POST | `/admin/classes/{id}/enrollments` | Enroll a student |
| DELETE | `/admin/classes/{id}/enrollments/{student_id}` | Unenroll a student |
| GET | `/admin/audit-logs` | Query modification history |

## Academic shared endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/departments` | authenticated | Department options |
| GET | `/courses` | authenticated | Course options |
| GET | `/classrooms` | authenticated | Classroom options with location config |
| GET | `/professor/classes` | professor | Assigned classes |
| GET | `/student/classes` | student | Enrolled classes |

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

QR payload contains only a versioned, random token (`uat:v1:<token>`). The database stores a SHA-256 hash of the token. Tokens are single-purpose, expire, are rotated on refresh, and are validated entirely on the backend. Each token may be used only once per student per session. Enrollment, session state, expiry, and classroom radius are checked server-side.

Location results are `verified`, `out_of_range`, `unavailable`, or `not_required`. `require_location` applies to both QR and face check-ins; out-of-range check-ins are rejected with `403 location_out_of_range`. QR check-ins send location fields with the token; face check-ins send the same fields alongside frames. `latitude`, `longitude`, and `accuracy` are optional when a session does not require location. GPS is treated as one signal, not proof of presence; short-lived tokens and active liveness checks are additional signals.

## Face registration and attendance

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/face/status` | student | Registration status and consent metadata |
| POST | `/face/register` | student | `{ "consent_version": "1.0", "frames": ["data:image/jpeg;base64,..."] }` |
| DELETE | `/face/me` | student | Delete all biometric embeddings and consent |
| POST | `/attendance/face` | student | `{ "session_id": "...", "frames": [...], "challenge": "turn_left", "latitude": 0, "longitude": 0, "accuracy": 0 }` |

The challenge is a server-configured value from `turn_left`, `turn_right`, or `blink`. Raw images are decoded in memory and never persisted. Embeddings are encrypted at rest with Fernet. Registration requires at least three valid frames with evidence of movement, rejects duplicate matches against other students, and replaces prior embeddings after successful re-registration. Attendance face verification requires active consent at the current policy version, an active session, enrollment, the active liveness challenge, required location verification, a score above the configured threshold, and no existing record for that session. Liveness checks are anti-spoofing heuristics and do not guarantee prevention of a determined replay attack. A professor/manual correction path exists for students unable to use biometrics.

## Attendance

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/attendance/me` | student | Personal attendance history with course percentages |
| GET | `/attendance/classes/{class_id}` | student/professor/admin | Class roster and attendance summary |
| PATCH | `/attendance/{record_id}` | professor/admin | Correct status/method with required reason |
| GET | `/professor/dashboard` | professor | Assigned course, class, and attendance statistics |
| GET | `/professor/attendance/history` | professor | Filterable attendance history |
| GET | `/student/dashboard` | student | Enrollment percentages, warnings, recent activity |

`attendance_records` has a unique constraint on `(session_id, student_id)`. Closing a session creates absent records for enrolled students without a check-in. Every manual or administrative modification writes an audit log entry with actor, before/after values, reason, IP, and user agent.

## Reports and analytics

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/reports/summary` | admin/professor | Aggregates with `period=daily|weekly|monthly|course|student|professor|department` |
| GET | `/reports/records` | admin/professor | Filterable, sortable, paginated records |
| GET | `/reports/export` | admin/professor | `format=xlsx|pdf`; returns a file stream |

Exports apply the same server-side filters and authorization as the report views.

## Operational

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness probe |
| GET | `/ready` | public | Database readiness probe |
| GET | `/openapi.json` | public | Generated API contract |

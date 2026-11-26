# Privacy, biometric, and accessibility statement

## Scope

This statement describes the current implementation of the Smart University Attendance Management System. It is operational documentation, not legal advice. The deploying institution remains the data controller and must publish its own jurisdiction-specific privacy notice before production use.

## Data collected

- Account data: name, email, hashed password, role, department, university ID or employee ID.
- Attendance data: session start/end times, QR token usage, status, method, timestamps, correction reasons, and audit entries.
- Face data: browser-generated 128-number descriptor vectors and face-center points. Raw camera frames stay in the browser and are never uploaded.
- Location data: browser-reported latitude, longitude, accuracy, and derived distance from the classroom for QR check-in.
- Device/network data: IP address and user agent for audited mutations.

## Biometric handling

- Registration requires explicit consent to the current `biometric_consent_version`; admin-assisted registration also requires `consent_confirmed` and an auditable consent reference.
- Descriptors are encrypted at rest with Fernet and compared using a server-configured cosine threshold.
- Duplicate-descriptor checks prevent one descriptor set from being registered to multiple students.
- A daily retention task deletes descriptors older than `FACE_RETENTION_DAYS` (365 days by default) and revokes consent when no descriptors remain.
- Students can delete their own descriptor data through `DELETE /face/me`. Administrators can replace descriptors on a student's behalf through the audited admin registration endpoint; direct admin deletion is not exposed.
- Face matching is not strong liveness detection. The movement checks are heuristics on browser-supplied centers, and modified client code can spoof descriptors or centers. Professor supervision and the manual correction path are required for disputed attendance.

## Geolocation handling

- Location is collected only for a check-in request and is not used for continuous tracking.
- Coordinates and accuracy are reported by the browser. They can be spoofed and must not be treated as proof of physical presence on their own.
- Geolocation checks are combined with short-lived rotating QR tokens, enrollment checks, session state, and professor oversight.

## Retention and deletion

- Face descriptors follow the retention setting above and can be deleted on demand.
- Attendance records, QR usage records, and audit logs are retained because they are the academic record and audit trail. The institution must define and publish its own retention schedule for these categories.
- Database backups inherit the retention of the source database and must be managed by the operator.

## Access control

- FastAPI enforces role and ownership checks server-side. Students cannot create, edit, or correct records for other students.
- JWT access tokens are held in frontend memory; refresh tokens are HttpOnly cookies with rotation and reuse detection.
- Audit logs capture actor, action, entity, before/after JSON, reason, IP, and user agent for sensitive mutations.

## Deployment obligations

- Use HTTPS, unique secrets, restricted CORS origins, trusted proxy configuration, and PostgreSQL in production.
- Set `RATE_LIMIT_STORAGE_URI` to a shared Redis instance when running more than one API instance.
- Restrict access to audit logs and exports; they contain personally identifiable information.
- Publish this statement through the institution's normal privacy channel and obtain any required consent beyond the in-app biometric consent.

## Accessibility

- The UI targets keyboard-operable controls, visible focus states, semantic tables, form labels, error summaries, and sufficient contrast in light and dark themes.
- It has not undergone a formal WCAG audit or assistive-technology certification. Users who encounter a barrier should report the affected page and workflow to the system administrator.
- QR and biometric check-in are not the only ways to record attendance; professor-supervised/manual correction remains available for students who cannot or choose not to use them.

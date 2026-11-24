import type {
  AdminDashboard,
  AttendanceRecord,
  AttendanceStatus,
  AuditLog,
  Classroom,
  ClassItem,
  Course,
  CourseProgress,
  Department,
  FaceStatus,
  NameValue,
  Paginated,
  ProfessorDashboard,
  QrPayload,
  ReportSummary,
  ScheduleItem,
  Session,
  SessionStatus,
  StudentDashboard,
  TrendPoint,
  User,
} from "@/lib/types";

type Raw = Record<string, unknown>;

export function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

export function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

export function arr(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

export function pick(
  source: Raw,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    if (isRecord(value) || Array.isArray(value)) continue;
    return str(value, fallback);
  }
  return fallback;
}

export function pickNumber(source: Raw, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = num(value, Number.NaN);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function pickBool(source: Raw, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return bool(source[key], fallback);
    }
  }
  return fallback;
}

function toRaw(value: unknown): Raw {
  return isRecord(value) ? value : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isRecord(item)) return pick(item, ["name", "day", "label", "value"]);
        return str(item);
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function idOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return str(value);
  const record = toRaw(value);
  return pick(record, ["id", "_id", "uuid", "student_id", "class_id"]);
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const status = pick(toRaw(value), ["status"], str(value)).toLowerCase();
  if (status.includes("late")) return "late";
  if (status.includes("absent")) return "absent";
  if (status.includes("excuse")) return "excused";
  if (status.includes("present")) return "present";
  return "present";
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  const status = pick(toRaw(value), ["status"], str(value)).toLowerCase();
  if (status.includes("active") || status.includes("open")) return "active";
  if (status.includes("close") || status.includes("end")) return "closed";
  if (status.includes("cancel")) return "cancelled";
  return "scheduled";
}

export function normalizeUser(value: unknown): User {
  const raw = toRaw(value);
  return {
    id: idOf(raw),
    full_name: pick(raw, ["full_name", "fullName", "name", "username"], "User"),
    email: pick(raw, ["email", "user_email"]),
    university_id: pick(raw, ["university_id", "student_id", "roll_number"]),
    role: (pick(raw, ["role", "user_role"], "student").toLowerCase() as User["role"]),
    department_id: idOf(raw.department) || pick(raw, ["department_id"]),
    department_name: pick(raw, ["department_name"]) ||
      pick(toRaw(raw.department), ["name"]),
    phone: pick(raw, ["phone", "phone_number"]),
    is_active: raw.is_active === undefined ? true : bool(raw.is_active, true),
    created_at: pick(raw, ["created_at", "createdAt"]),
  };
}

export function normalizeDepartment(value: unknown): Department {
  const raw = toRaw(value);
  return {
    id: idOf(raw),
    name: pick(raw, ["name", "department_name"], "Department"),
    code: pick(raw, ["code", "short_name"]),
    description: pick(raw, ["description"]),
    created_at: pick(raw, ["created_at"]),
  };
}

export function normalizeCourse(value: unknown): Course {
  const raw = toRaw(value);
  return {
    id: idOf(raw),
    name: pick(raw, ["name", "course_name"], "Course"),
    code: pick(raw, ["code", "course_code"]),
    credits: pickNumber(raw, ["credits", "credit_hours"]),
    department_id: idOf(raw.department) || pick(raw, ["department_id"]),
    department_name: pick(raw, ["department_name"]) ||
      pick(toRaw(raw.department), ["name"]),
    description: pick(raw, ["description"]),
  };
}

export function normalizeClassroom(value: unknown): Classroom {
  const raw = toRaw(value);
  return {
    id: idOf(raw),
    name: pick(raw, ["name", "room_name", "room"], "Classroom"),
    building: pick(raw, ["building"]),
    room: pick(raw, ["room", "room_number"]),
    latitude: pickNumber(raw, ["latitude", "lat"], Number.NaN),
    longitude: pickNumber(raw, ["longitude", "lng", "lon"], Number.NaN),
    radius_meters: pickNumber(raw, ["radius_meters", "radius"], Number.NaN),
    capacity: pickNumber(raw, ["capacity"], Number.NaN),
  };
}

export function normalizeClass(value: unknown): ClassItem {
  const raw = toRaw(value);
  const course = toRaw(raw.course);
  const professor = toRaw(raw.professor);
  const classroom = toRaw(raw.classroom);
  return {
    id: idOf(raw),
    name: pick(raw, ["name", "class_name", "section_name"], "Class"),
    code: pick(raw, ["code", "class_code", "section"]),
    section: pick(raw, ["section"]),
    course_id: idOf(raw.course) || pick(raw, ["course_id"]),
    course_name:
      pick(raw, ["course_name"]) ||
      pick(course, ["name", "course_name"]),
    professor_id: idOf(raw.professor) || pick(raw, ["professor_id"]),
    professor_name:
      pick(raw, ["professor_name"]) ||
      pick(professor, ["full_name", "name"]),
    classroom_id: idOf(raw.classroom) || pick(raw, ["classroom_id"]),
    classroom_name:
      pick(raw, ["classroom_name"]) || pick(classroom, ["name", "room"]),
    department_id: pick(raw, ["department_id"]),
    term: pick(raw, ["term"]),
    semester: pick(raw, ["semester"]),
    academic_year: pick(raw, ["academic_year"]),
    capacity: pickNumber(raw, ["capacity"], Number.NaN),
    enrolled_count: pickNumber(raw, [
      "enrolled_count",
      "student_count",
      "students_count",
      "total_students",
    ], Number.NaN),
    schedule_days: stringList(
      raw.schedule_days ?? raw.days ?? raw.schedule ?? raw.meeting_days,
    ),
    start_time: pick(raw, ["start_time", "starts_at", "time_from"]),
    end_time: pick(raw, ["end_time", "ends_at", "time_to"]),
    status: pick(raw, ["status"]),
  };
}

export function normalizeSchedule(value: unknown): ScheduleItem {
  const raw = toRaw(value);
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const classRaw = toRaw(raw.class);
  const classroomRaw = toRaw(raw.classroom);
  const dayOfWeek = pickNumber(raw, ["day_of_week"], Number.NaN);
  return {
    id: idOf(raw),
    class_id: idOf(classRaw) || pick(raw, ["class_id"]),
    class_name: pick(raw, ["class_name"]) || pick(classRaw, ["name"]),
    course_id: pick(raw, ["course_id"]),
    course_name: pick(raw, ["course_name"]) || pick(toRaw(raw.course), ["name"]),
    professor_name: pick(raw, ["professor_name"]),
    classroom_id: idOf(classroomRaw) || pick(raw, ["classroom_id"]),
    classroom_name: pick(raw, ["classroom_name"]) || pick(classroomRaw, ["name"]),
    day_of_week: dayOfWeek,
    day_name:
      pick(raw, ["day_name"]) ||
      (Number.isFinite(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6 ? weekDays[dayOfWeek] : undefined),
    start_time: pick(raw, ["start_time"]),
    end_time: pick(raw, ["end_time"]),
  };
}

export function normalizeSession(value: unknown): Session {
  const raw = toRaw(value);
  const attendanceRaw = toRaw(raw.attendance_summary);
  return {
    id: idOf(raw),
    class_id:
      idOf(raw.class) || pick(raw, ["class_id", "classroom_id"]) || "",
    class_name:
      pick(raw, ["class_name"]) || pick(toRaw(raw.class), ["name", "class_name"]),
    course_name:
      pick(raw, ["course_name"]) || pick(toRaw(raw.class), ["course_name"]),
    professor_id: pick(raw, ["professor_id"]),
    classroom_id: idOf(raw.classroom) || pick(raw, ["classroom_id"]),
    classroom_name:
      pick(raw, ["classroom_name"]) || pick(toRaw(raw.classroom), ["name"]),
    status: normalizeSessionStatus(raw.status),
    start_time: pick(raw, ["start_time", "starts_at", "scheduled_start"]),
    end_time: pick(raw, ["end_time", "ends_at", "scheduled_end"]),
    started_at: pick(raw, ["started_at", "opened_at"]),
    closed_at: pick(raw, ["closed_at", "ended_at"]),
    late_minutes: pickNumber(raw, ["late_minutes", "lateness_minutes", "late_threshold_minutes"]),
    qr_refresh_seconds: pickNumber(raw, [
      "qr_refresh_seconds",
      "qr_refresh_interval",
      "token_refresh_seconds",
    ]),
    require_location: pickBool(raw, ["require_location", "location_required"]),
    require_face: pickBool(raw, ["require_face"]),
    challenge: pick(raw, ["challenge"]) || undefined,
    qr_generation: pickNumber(raw, ["qr_generation"], 0),
    present_count: pickNumber(raw, ["present_count", "present"], 0) ||
      pickNumber(attendanceRaw, ["present_count", "present"], 0),
    late_count: pickNumber(raw, ["late_count", "late"], 0) ||
      pickNumber(attendanceRaw, ["late_count", "late"], 0),
    absent_count: pickNumber(raw, ["absent_count", "absent"], 0) ||
      pickNumber(attendanceRaw, ["absent_count", "absent"], 0),
    total_students: pickNumber(raw, [
      "total_students",
      "total_enrolled",
      "enrolled_count",
      "student_count",
    ], 0),
    created_at: pick(raw, ["created_at"]),
  };
}

export function normalizeQrPayload(value: unknown): QrPayload | null {
  const root = toRaw(value);
  const raw = isRecord(root.qr) ? root.qr : root;
  const qr_payload = pick(raw, ["qr_payload", "qr_token", "qr_code", "token", "qr_data"]);
  if (!qr_payload) return null;
  const refresh_after_seconds = pickNumber(
    raw,
    ["refresh_after_seconds", "qr_refresh_seconds"],
    Number.NaN,
  );
  return {
    qr_payload,
    expires_at: pick(raw, ["expires_at", "expiresAt"]) || undefined,
    generation: pickNumber(raw, ["generation", "qr_generation"], 0),
    refresh_after_seconds: Number.isNaN(refresh_after_seconds)
      ? undefined
      : refresh_after_seconds,
  };
}

export function normalizeAttendance(value: unknown): AttendanceRecord {
  const raw = toRaw(value);
  const student = toRaw(raw.student);
  const session = toRaw(raw.session);
  const classRaw = toRaw(raw.class);
  const course = toRaw(raw.course);
  return {
    id: pick(raw, ["id", "attendance_id", "record_id"]),
    session_id: idOf(raw.session) || pick(raw, ["session_id"]),
    student_id: idOf(raw.student) || pick(raw, ["student_id"]),
    student_name:
      pick(raw, ["student_name"]) || pick(student, ["full_name", "name"]),
    university_id:
      pick(raw, ["university_id"]) || pick(student, ["university_id"]),
    class_id:
      idOf(raw.class) || pick(raw, ["class_id"]) || pick(session, ["class_id"]),
    class_name:
      pick(raw, ["class_name"]) || pick(classRaw, ["name", "class_name"]),
    course_id: idOf(raw.course) || pick(raw, ["course_id"]),
    course_name:
      pick(raw, ["course_name"]) || pick(course, ["name", "course_name"]),
    date:
      pick(raw, ["date", "marked_at", "created_at"]) ||
      pick(session, ["date"]),
    status: normalizeStatus(raw.status),
    method: pick(raw, ["method", "check_in_method", "marked_by_method"]).toLowerCase() as
      | AttendanceRecord["method"]
      | undefined,
    marked_at: pick(raw, ["marked_at", "checked_in_at", "created_at"]),
    reason: pick(raw, ["reason", "correction_reason"]),
    latitude: pickNumber(raw, ["latitude", "lat"], Number.NaN),
    longitude: pickNumber(raw, ["longitude", "lng"], Number.NaN),
    location_status: pick(raw, ["location_status"]).toLowerCase() as
      | AttendanceRecord["location_status"]
      | undefined,
  };
}

export function normalizeCourseProgress(value: unknown): CourseProgress {
  const raw = toRaw(value);
  const course = toRaw(raw.course);
  const classRaw = toRaw(raw.class);
  const present = pickNumber(raw, ["present", "present_count", "attended"]);
  const late = pickNumber(raw, ["late", "late_count"]);
  const absent = pickNumber(raw, ["absent", "absent_count"]);
  const total =
    pickNumber(raw, ["total", "total_classes", "total_sessions"], Number.NaN) ||
    present + late + absent;
  return {
    course_id: idOf(raw.course) || pick(raw, ["course_id", "id"]),
    course_name:
      pick(raw, ["course_name"]) || pick(course, ["name", "course_name"], "Course"),
    class_id: idOf(raw.class) || pick(raw, ["class_id"]),
    class_name:
      pick(raw, ["class_name"]) || pick(classRaw, ["name", "class_name"]),
    percentage:
      pickNumber(raw, ["percentage", "attendance_percentage", "rate"], Number.NaN) ||
      (total > 0 ? Math.round(((present + late) / total) * 100) : 0),
    present,
    late,
    absent,
    total,
  };
}

export function normalizePaginated<T>(
  value: unknown,
  mapper: (item: unknown) => T,
): Paginated<T> {
  const raw = toRaw(value);
  const root = isRecord(raw.data) ? raw.data : raw;
  const source = Array.isArray(value)
    ? value
    : arr(root.items ?? root.results ?? root.data ?? root.records);
  const page = pickNumber(root, ["page", "current_page"], 1);
  const page_size = pickNumber(root, ["page_size", "per_page", "limit"], source.length || 20);
  const total = pickNumber(root, ["total", "count"], source.length);
  const pages = pickNumber(root, ["pages", "total_pages"], Math.ceil(total / (page_size || 1)));
  return {
    items: source.map(mapper),
    total,
    page,
    page_size,
    pages,
  };
}

function toTrendPoints(value: unknown): TrendPoint[] {
  return arr(value).map((item, index) => {
    if (isRecord(item)) {
      return {
        label: pick(item, ["label", "date", "day", "name", "period", "week"], `P${index + 1}`),
        value: pickNumber(item, ["value", "count", "percentage", "attendance_rate", "total"]),
      };
    }
    return { label: `${index + 1}`, value: num(item) };
  });
}

function toNameValues(value: unknown): NameValue[] {
  if (isRecord(value) && !Array.isArray(value)) {
    return Object.entries(value).map(([name, item]) => ({
      name,
      value: isRecord(item)
        ? pickNumber(item, ["value", "count", "percentage", "total"])
        : num(item),
    }));
  }
  return arr(value).map((item, index) => {
    if (isRecord(item)) {
      return {
        name: pick(item, ["name", "label", "status", "department", "course"], `Item ${index + 1}`),
        value: pickNumber(item, ["value", "count", "percentage", "total", "attendance_rate"]),
      };
    }
    return { name: `${index + 1}`, value: num(item) };
  });
}

function flatten(value: unknown): Raw {
  const raw = toRaw(value);
  return {
    ...raw,
    ...toRaw(raw.stats),
    ...toRaw(raw.overview),
    ...toRaw(raw.summary),
    ...toRaw(raw.data),
  };
}

export function normalizeAdminDashboard(value: unknown): AdminDashboard {
  const raw = flatten(value);
  return {
    total_users: pickNumber(raw, ["total_users", "users_count", "users"]),
    total_students: pickNumber(raw, ["total_students", "students_count", "students"]),
    total_professors: pickNumber(raw, ["total_professors", "professors_count"]),
    total_departments: pickNumber(raw, ["total_departments", "departments_count"]),
    total_courses: pickNumber(raw, ["total_courses", "courses_count"]),
    total_classes: pickNumber(raw, ["total_classes", "classes_count"]),
    total_sessions: pickNumber(raw, ["total_sessions", "sessions_count"]),
    attendance_rate: pickNumber(raw, [
      "attendance_rate",
      "overall_attendance_rate",
      "average_attendance",
      "attendance_percentage",
    ]),
    trend: toTrendPoints(raw.attendance_trend ?? raw.trend ?? raw.daily_attendance),
    status_distribution: toNameValues(
      raw.status_distribution ?? raw.attendance_distribution ?? raw.status_counts,
    ),
    department_attendance: toNameValues(
      raw.department_attendance ?? raw.by_department ?? raw.departments,
    ),
    recent_activity: arr(raw.recent_activity ?? raw.recent_attendance ?? raw.activity).map(
      normalizeAttendance,
    ),
  };
}

export function normalizeProfessorDashboard(value: unknown): ProfessorDashboard {
  const raw = flatten(value);
  return {
    assigned_courses: pickNumber(raw, ["assigned_courses", "total_courses", "courses_count"]),
    assigned_classes: pickNumber(raw, ["assigned_classes", "total_classes", "classes_count"]),
    total_students: pickNumber(raw, ["total_students", "students_count"]),
    total_sessions: pickNumber(raw, ["total_sessions", "sessions_count"]),
    attendance_rate: pickNumber(raw, [
      "attendance_rate",
      "overall_attendance_rate",
      "average_attendance",
      "attendance_percentage",
    ]),
    trend: toTrendPoints(raw.attendance_trend ?? raw.trend ?? raw.daily_attendance),
    class_attendance: toNameValues(
      raw.class_attendance ?? raw.by_class ?? raw.classes,
    ),
    status_distribution: toNameValues(
      raw.status_distribution ?? raw.attendance_distribution ?? raw.status_counts,
    ),
    recent_sessions: arr(raw.recent_sessions ?? raw.sessions).map(normalizeSession),
    recent_activity: arr(raw.recent_activity ?? raw.recent_attendance ?? raw.activity).map(
      normalizeAttendance,
    ),
  };
}

export function normalizeStudentDashboard(value: unknown): StudentDashboard {
  const raw = flatten(value);
  return {
    overall_percentage: pickNumber(raw, [
      "overall_percentage",
      "attendance_percentage",
      "attendance_rate",
      "overall_attendance",
    ]),
    enrolled_courses: arr(raw.enrolled_courses ?? raw.courses ?? raw.percentages).map(
      normalizeCourseProgress,
    ),
    today_classes: arr(raw.today_classes ?? raw.today ?? raw.classes_today).map(
      normalizeClass,
    ),
    recent_attendance: arr(raw.recent_attendance ?? raw.recent_activity ?? raw.activity).map(
      normalizeAttendance,
    ),
    warnings: arr(raw.warnings ?? raw.alerts)
      .map((item) => (isRecord(item) ? pick(item, ["message", "text"]) : str(item)))
      .filter(Boolean),
    trend: toTrendPoints(raw.trend ?? raw.attendance_trend),
  };
}

export function normalizeAttendanceSummary(value: unknown) {
  const raw = flatten(value);
  const recordsSource =
    raw.records ??
    raw.history ??
    raw.items ??
    (isRecord(raw.data) ? raw.data.items ?? raw.data.records : undefined);
  return {
    overall_percentage: pickNumber(raw, [
      "overall_percentage",
      "attendance_percentage",
      "attendance_rate",
    ]),
    percentages: arr(raw.percentages ?? raw.courses ?? raw.course_percentages).map(
      normalizeCourseProgress,
    ),
    records: normalizePaginated(recordsSource, normalizeAttendance),
  };
}

export function normalizeReportSummary(value: unknown): ReportSummary {
  const raw = flatten(value);
  return {
    total_records: pickNumber(raw, ["total_records", "total", "records_count"]),
    average_attendance: pickNumber(raw, [
      "average_attendance",
      "attendance_rate",
      "attendance_percentage",
    ]),
    present: pickNumber(raw, ["present", "present_count"]),
    late: pickNumber(raw, ["late", "late_count"]),
    absent: pickNumber(raw, ["absent", "absent_count"]),
    by_period: toTrendPoints(raw.by_period ?? raw.trend ?? raw.daily),
    by_course: toNameValues(raw.by_course ?? raw.courses),
    by_department: toNameValues(raw.by_department ?? raw.departments),
  };
}

export function normalizeAuditLog(value: unknown): AuditLog {
  const raw = toRaw(value);
  const actor = toRaw(raw.actor);
  return {
    id: pick(raw, ["id", "log_id"]),
    actor_id: idOf(raw.actor) || pick(raw, ["actor_id", "user_id"]),
    actor_name:
      pick(raw, ["actor_name", "user_name"]) || pick(actor, ["full_name", "name"]),
    action: pick(raw, ["action", "event", "operation"]),
    entity_type: pick(raw, ["entity_type", "resource", "table_name"]),
    entity_id: pick(raw, ["entity_id", "object_id", "record_id"]),
    before: isRecord(raw.before) ? raw.before : undefined,
    after: isRecord(raw.after) ? raw.after : undefined,
    reason: pick(raw, ["reason"]),
    ip_address: pick(raw, ["ip_address", "ip"]),
    created_at: pick(raw, ["created_at", "timestamp"]),
  };
}

export function normalizeFaceStatus(value: unknown): FaceStatus {
  const raw = flatten(value);
  return {
    registered: pickBool(raw, ["registered", "is_registered", "has_embeddings"]),
    consent_version: pick(raw, ["consent_version"]),
    consented_at: pick(raw, ["consented_at", "created_at"]),
    frames_count: pickNumber(raw, ["frames_count", "embedding_count"], Number.NaN),
    model_status: pick(raw, ["model_status", "status"]),
  };
}

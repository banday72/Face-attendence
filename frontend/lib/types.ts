export type Role = "admin" | "professor" | "student";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type AttendanceMethod = "qr" | "face" | "manual";
export type SessionStatus = "scheduled" | "active" | "closed" | "cancelled";
export type LocationStatus =
  | "verified"
  | "out_of_range"
  | "unavailable"
  | "not_required";
export type RecurrenceType =
  | "one_time"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom"
  | "semester";
export type ClassType = "Lecture" | "Lab" | "Practical" | "Tutorial";
export type CourseType = "theoretical" | "practical" | "laboratory";
export type TimetableView = "day" | "week" | "month" | "list";
export type ConflictType =
  | "teacher"
  | "classroom"
  | "student_group"
  | "semester_range"
  | "capacity";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AuthResult {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  university_id?: string;
  employee_id?: string;
  program?: string;
  year_level?: number;
  title?: string;
  office?: string;
  role: Role;
  department_id?: string;
  department_name?: string;
  phone?: string;
  is_active: boolean;
  created_at?: string;
}

export interface ProfessorOption {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  employee_id: string;
  department_id?: string;
  department_name?: string;
  title?: string;
  is_active: boolean;
}

export interface StudentOption {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  university_id: string;
  department_id?: string;
  department_name?: string;
  program?: string;
  year_level?: number;
  is_active: boolean;
}

export interface CourseProfessor {
  id: string;
  course_id: string;
  professor_id: string;
  full_name: string;
  email: string;
  employee_id: string;
  department_name?: string;
  assigned_at: string;
}

export interface Semester {
  id: string;
  name: string;
  code: string;
  number?: number;
  academic_year: string;
  session?: string;
  department_id?: string;
  department_name?: string;
  program?: string;
  start_date?: string;
  end_date?: string;
  registration_start?: string;
  registration_end?: string;
  exam_start?: string;
  exam_end?: string;
  is_active: boolean;
  class_count?: number;
  student_count?: number;
  is_current?: boolean;
  created_at?: string;
}

export interface FacultyMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  employee_id: string;
  department_id?: string;
  department_name?: string;
  title?: string;
  office?: string;
  is_active: boolean;
  course_count?: number;
  class_count?: number;
  created_at?: string;
}

export interface ClassProfessor {
  id: string;
  class_id: string;
  class_name?: string;
  course_id?: string;
  course_name?: string;
  semester_id?: string;
  semester?: string;
  academic_year?: string;
  professor_id: string;
  full_name: string;
  email: string;
  employee_id: string;
  department_name?: string;
  assigned_at: string;
}

export interface RosterEntry {
  student_id: string;
  university_id?: string;
  student_name: string;
  enrollment_status: string;
  record?: AttendanceRecord;
}

export interface Department {
  id: string;
  name: string;
  code?: string;
  description?: string;
  created_at?: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  credits?: number;
  department_id?: string;
  department_name?: string;
  course_type?: CourseType | string;
  description?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  course_type: CourseType | string;
  department_id: string;
  department_name?: string;
  description?: string;
  semester_ids: string[];
  eligible_professor_ids: string[];
  created_at?: string;
}

export interface DepartmentDetail extends Department {
  teachers: FacultyMember[];
  subjects: Subject[];
  classes: ClassItem[];
  semesters: Semester[];
}

export interface Classroom {
  id: string;
  name: string;
  building?: string;
  room?: string;
  room_type?: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  radius_override_meters?: number;
  capacity?: number;
  is_active?: boolean;
  scheduled_classes?: number;
  created_at?: string;
}

export interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  holiday_type: string;
  description?: string;
  created_at?: string;
}

export interface ClassItem {
  id: string;
  name: string;
  code?: string;
  section?: string;
  course_id?: string;
  course_name?: string;
  professor_id?: string;
  professor_name?: string;
  classroom_id?: string;
  classroom_name?: string;
  department_id?: string;
  term?: string;
  semester_id?: string;
  semester?: string;
  academic_year?: string;
  capacity?: number;
  enrolled_count?: number;
  is_active?: boolean;
  schedule_days: string[];
  start_time?: string;
  end_time?: string;
  status?: string;
}

export interface ScheduleItem {
  id: string;
  class_id: string;
  class_name?: string;
  course_id?: string;
  course_name?: string;
  professor_id?: string;
  professor_name?: string;
  classroom_id?: string;
  classroom_name?: string;
  department_id?: string;
  department_name?: string;
  semester_id?: string;
  semester_name?: string;
  schedule_group_id?: string;
  class_type?: ClassType | string;
  notes?: string;
  recurrence_type?: RecurrenceType | string;
  start_date?: string;
  end_date?: string;
  repeat_days?: number[];
  custom_dates?: string[];
  holiday_dates?: string[];
  exclude_holidays?: boolean;
  monthly_mode?: "date" | "weekday";
  day_of_week: number;
  day_name?: string;
  start_time: string;
  end_time: string;
}

export interface ScheduleGroup {
  group_id: string;
  items: ScheduleItem[];
  occurrences: number;
}

export interface TimetableEntry {
  id: string;
  schedule_id: string;
  group_id?: string;
  date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name?: string;
  course_id?: string;
  course_name?: string;
  course_code?: string;
  professor_id?: string;
  professor_name?: string;
  classroom_id?: string;
  classroom_name?: string;
  department_id?: string;
  department_name?: string;
  semester_id?: string;
  semester_name?: string;
  class_type: ClassType | string;
  notes?: string;
  recurrence_type: RecurrenceType | string;
}

export interface TimetableConflict {
  type: ConflictType | string;
  severity: "error" | "warning";
  message: string;
  date?: string;
  schedule_id?: string;
  other_schedule_id?: string;
}

export interface TimetableSummary {
  total_schedules: number;
  classes_today: number;
  upcoming_classes: number;
  conflicts: number;
  by_type: Record<string, number>;
}

export interface Session {
  id: string;
  class_id: string;
  class_name?: string;
  course_name?: string;
  professor_id?: string;
  classroom_id?: string;
  classroom_name?: string;
  status: SessionStatus;
  start_time?: string;
  end_time?: string;
  started_at?: string;
  closed_at?: string;
  late_minutes: number;
  qr_refresh_seconds: number;
  require_location: boolean;
  require_face: boolean;
  challenge?: string;
  qr_generation?: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  total_students: number;
  created_at?: string;
}

export interface QrPayload {
  qr_payload: string;
  expires_at?: string;
  generation: number;
  refresh_after_seconds?: number;
}

export interface AttendanceRecord {
  id: string;
  session_id?: string;
  student_id?: string;
  student_name?: string;
  university_id?: string;
  class_id?: string;
  class_name?: string;
  course_id?: string;
  course_name?: string;
  date?: string;
  status: AttendanceStatus;
  method?: AttendanceMethod;
  marked_at?: string;
  reason?: string;
  latitude?: number;
  longitude?: number;
  location_status?: LocationStatus;
}

export interface CourseProgress {
  course_id: string;
  course_name: string;
  class_id?: string;
  class_name?: string;
  percentage: number;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface NameValue {
  name: string;
  value: number;
}

export interface AdminDashboard {
  scheduling?: Record<string, number>;
  total_users: number;
  total_students: number;
  total_professors: number;
  total_departments: number;
  total_courses: number;
  total_classes: number;
  total_sessions: number;
  attendance_rate: number;
  trend: TrendPoint[];
  status_distribution: NameValue[];
  department_attendance: NameValue[];
  recent_activity: AttendanceRecord[];
}

export interface ProfessorDashboard {
  assigned_courses: number;
  assigned_classes: number;
  total_students: number;
  total_sessions: number;
  attendance_rate: number;
  trend: TrendPoint[];
  class_attendance: NameValue[];
  status_distribution: NameValue[];
  recent_sessions: Session[];
  recent_activity: AttendanceRecord[];
}

export interface StudentDashboard {
  overall_percentage: number;
  enrolled_courses: CourseProgress[];
  today_classes: ClassItem[];
  recent_attendance: AttendanceRecord[];
  warnings: string[];
  trend: TrendPoint[];
}

export interface AttendanceSummary {
  overall_percentage: number;
  percentages: CourseProgress[];
  records: Paginated<AttendanceRecord>;
}

export interface ReportSummary {
  total_records: number;
  average_attendance: number;
  present: number;
  late: number;
  absent: number;
  by_period: TrendPoint[];
  by_course: NameValue[];
  by_department: NameValue[];
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ip_address?: string;
  created_at?: string;
}

export interface FaceStatus {
  registered: boolean;
  consent_version?: string;
  consented_at?: string;
  frames_count?: number;
  model_status?: string;
}

export interface CheckInResult {
  attendance_id?: string;
  status: AttendanceStatus;
  message?: string;
  location_status?: LocationStatus;
  student_name?: string;
  class_name?: string;
}

export interface CreateSessionPayload {
  class_id: string;
  classroom_id?: string;
  starts_at: string;
  ends_at: string;
  require_face: boolean;
  challenge?: string;
  late_minutes: number;
  qr_refresh_seconds: number;
  require_location: boolean;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  university_id: string;
  password: string;
  department_id?: string | null;
  program?: string | null;
  year_level?: number | null;
}

export interface ProfessorRegisterPayload {
  full_name: string;
  email: string;
  employee_id: string;
  password: string;
  department_id?: string | null;
  title?: string | null;
  office?: string | null;
}

export interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

export interface RegistrationOptions {
  departments: DepartmentOption[];
}

export interface InviteDetails {
  full_name: string;
  email: string;
  university_id: string;
  program: string | null;
  year_level: number | null;
  department_id: string | null;
  department_name: string | null;
  expires_at: string;
}

export interface InviteCreated {
  id: string;
  full_name: string;
  email: string;
  university_id: string;
  program: string | null;
  year_level: number | null;
  department_name: string | null;
  status: string;
  token: string;
  url: string;
  expires_at: string;
}

export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface CorrectionRequestPayload {
  session_id: string;
  record_id?: string | null;
  requested_status: AttendanceStatus;
  reason: string;
}

export interface CorrectionReviewPayload {
  decision: "approved" | "rejected";
  final_status?: AttendanceStatus;
  final_method?: AttendanceMethod;
  review_note?: string;
}

export interface CorrectionRequest {
  id: string;
  session_id: string;
  record_id: string | null;
  requested_status: AttendanceStatus;
  reason: string;
  review_note: string | null;
  status: CorrectionStatus;
  reviewed_at?: string | null;
  created_at: string;
  student_name: string;
  university_id: string;
  course_code: string;
  class_section: string;
  session_start: string;
  reviewer_name: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  phone: string | null;
  created_at: string;
  university_id?: string | null;
  employee_id?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  program?: string | null;
  year_level?: number | null;
  title?: string | null;
  office?: string | null;
}

export interface Consent {
  id: string | null;
  student_id: string | null;
  consent_version: string | null;
  current_version: string;
  consented_at?: string | null;
  revoked_at?: string | null;
  is_active: boolean;
  requires_new_consent: boolean;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "warning" | "danger" | "info";
  href: string | null;
}

export interface MissingStudent {
  student_id: string;
  university_id: string;
  student_name: string;
  enrollment_status: string;
}

export interface MarkAbsentResult {
  session_id: string;
  marked_count: number;
  marked_student_ids: string[];
}

export interface ClassRisk {
  class_id: string;
  course_code: string;
  course_name: string;
  section: string;
  enrolled_count: number;
  total_sessions: number;
  present: number;
  late: number;
  absent: number;
  attendance_rate: number;
  at_risk_count: number;
}

export interface BulkImportError {
  row: number;
  email: string;
  error: string;
}

export interface BulkImportPreview {
  total: number;
  valid: number;
  samples: Record<string, unknown>[];
  errors: BulkImportError[];
}

export interface BulkImportResult {
  total: number;
  created: number;
  failed: number;
  errors: BulkImportError[];
  upload_id: string;
}

export interface BulkImportUpload {
  id: string;
  actor_name: string | null;
  filename: string;
  total: number;
  created: number;
  failed: number;
  created_at: string;
}

export interface ReportFilter {
  from_date?: string | null;
  to_date?: string | null;
  course_id?: string | null;
  class_id?: string | null;
  professor_id?: string | null;
  department_id?: string | null;
  status?: AttendanceStatus | null;
  method?: AttendanceMethod | null;
  group_by?: string | null;
  period?: string | null;
}

export interface ReportPreset {
  id: string;
  user_id: string;
  name: string;
  report_type: string;
  filters: ReportFilter;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledExport {
  id: string;
  user_id: string;
  name: string;
  format: "xlsx" | "pdf";
  frequency: "daily" | "weekly" | "monthly";
  filters: ReportFilter;
  next_run_at: string;
  last_run_at?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledExportRun {
  id: string;
  schedule_id: string;
  user_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FaceEmbeddingData {
  id: string;
  vector: number[];
  model_name: string;
  vector_version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FaceDataExport {
  export_id: string;
  student_id: string;
  university_id: string;
  exported_at: string;
  embedding_count: number;
  model_name: string;
  vector_version: string;
  descriptors: number[][];
  embeddings: FaceEmbeddingData[];
  consent?: Consent | null;
  consent_metadata?: Consent | null;
}

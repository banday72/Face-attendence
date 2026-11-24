export type Role = "admin" | "professor" | "student";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type AttendanceMethod = "qr" | "face" | "manual";
export type SessionStatus = "scheduled" | "active" | "closed" | "cancelled";
export type LocationStatus =
  | "verified"
  | "out_of_range"
  | "unavailable"
  | "not_required";

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
  role: Role;
  department_id?: string;
  department_name?: string;
  phone?: string;
  is_active: boolean;
  created_at?: string;
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
  description?: string;
}

export interface Classroom {
  id: string;
  name: string;
  building?: string;
  room?: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  capacity?: number;
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
  semester?: string;
  academic_year?: string;
  capacity?: number;
  enrolled_count?: number;
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
  professor_name?: string;
  classroom_id?: string;
  classroom_name?: string;
  day_of_week: number;
  day_name?: string;
  start_time: string;
  end_time: string;
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
  department_id?: string;
}

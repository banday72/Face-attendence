from app.models.academic_holiday import AcademicHoliday
from app.models.attendance_record import AttendanceRecord
from app.models.attendance_session import AttendanceSession
from app.models.audit_log import AuditLog
from app.models.biometric_consent import BiometricConsent
from app.models.class_ import Class_
from app.models.class_professor import class_professors
from app.models.classroom import Classroom
from app.models.course import Course
from app.models.course_professor import course_professors
from app.models.course_semester import course_semesters
from app.models.department import Department
from app.models.enrollment import Enrollment
from app.models.face_embedding import FaceEmbedding
from app.models.professor import Professor
from app.models.qr_token_usage import QRTokenUsage
from app.models.refresh_token import RefreshToken
from app.models.schedule import Schedule
from app.models.semester import Semester
from app.models.student import Student
from app.models.user import User

__all__ = [
    "AcademicHoliday",
    "AttendanceRecord",
    "AttendanceSession",
    "AuditLog",
    "BiometricConsent",
    "Class_",
    "Classroom",
    "Course",
    "Department",
    "Enrollment",
    "FaceEmbedding",
    "Professor",
    "QRTokenUsage",
    "RefreshToken",
    "Schedule",
    "Semester",
    "Student",
    "User",
    "class_professors",
    "course_professors",
    "course_semesters",
]

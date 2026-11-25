from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Literal, cast

from fastapi import (
    APIRouter,
    Depends,
    File,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import ValidationError
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints._helpers import pagination
from app.core.audit import write_audit_log
from app.core.config import settings
from app.core.deps import DB_Dependency, require_admin
from app.core.errors import AppError
from app.core.rate_limit import face_register_limit
from app.core.security import hash_password
from app.models import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    RefreshToken,
    Schedule,
    Student,
    User,
    course_professors,
)
from app.schemas.admin import (
    AlertOut,
    AlertsOut,
    AuditLogOut,
    BulkImportError,
    BulkImportResult,
    ClassCreate,
    ClassOut,
    ClassUpdate,
    CourseCreate,
    CourseOut,
    CourseProfessorOut,
    CourseUpdate,
    DashboardOut,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    EnrollmentCreate,
    EnrollmentOut,
    PasswordResetIn,
    ProfessorOptionOut,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
    StudentOptionOut,
    UserAdminOut,
    UserCreate,
    UserUpdate,
)
from app.schemas.auth import Role
from app.schemas.common import Page, apply_sort, paginate
from app.schemas.face import AdminFaceRegisterIn, FaceRegisterOut, FaceStatusOut
from app.services import class_service, face_service
from app.utils.uuid import new_uuid, utcnow

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _get_or_404(db: Session, model: Any, entity_id: str, label: str) -> Any:
    entity = db.get(model, entity_id)
    if entity is None:
        raise AppError(404, "not_found", f"{label} not found")
    return entity


def _resolve_student(db: Session, identifier: str) -> Student:
    student = db.get(Student, identifier)
    if student is None:
        student = db.scalar(select(Student).where(Student.user_id == identifier))
    if student is None:
        raise AppError(404, "not_found", "Student not found")
    return student


def _check_unique(db: Session, model: Any, column: Any, value: Any, label: str, exclude_id: str | None = None) -> None:
    query = select(model).where(column == value)
    if exclude_id:
        query = query.where(model.id != exclude_id)
    if db.scalar(query) is not None:
        raise AppError(409, "conflict", f"{label} already exists")


def _snapshot(entity: Any, fields: list[str]) -> dict[str, Any]:
    return {field: getattr(entity, field, None) for field in fields}


def _apply(entity: Any, payload: Any) -> dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    before = {}
    for key, value in updates.items():
        before[key] = getattr(entity, key, None)
        setattr(entity, key, value)
    return before


def _department_name(db: Session, department_id: str | None) -> str | None:
    if not department_id:
        return None
    department = db.get(Department, department_id)
    return department.name if department else None


def _user_out(db: Session, user: User) -> UserAdminOut:
    student = db.scalar(select(Student).where(Student.user_id == user.id))
    professor = db.scalar(select(Professor).where(Professor.user_id == user.id))
    profile = student or professor
    return UserAdminOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=cast(Role, user.role),
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
        department_id=profile.department_id if profile else None,
        department_name=_department_name(db, profile.department_id if profile else None),
        university_id=student.university_id if student else None,
        employee_id=professor.employee_id if professor else None,
        program=student.program if student else None,
        year_level=student.year_level if student else None,
        title=professor.title if professor else None,
        office=professor.office if professor else None,
    )


def _course_out(db: Session, course: Course) -> CourseOut:
    return CourseOut(
        id=course.id,
        code=course.code,
        name=course.name,
        credits=course.credits,
        department_id=course.department_id,
        department_name=_department_name(db, course.department_id),
        description=course.description,
        created_at=course.created_at,
    )


def _professor_option_out(db: Session, professor: Professor) -> ProfessorOptionOut:
    return ProfessorOptionOut(
        id=professor.id,
        user_id=professor.user_id,
        email=professor.user.email,
        full_name=professor.user.full_name,
        employee_id=professor.employee_id,
        department_id=professor.department_id,
        department_name=_department_name(db, professor.department_id),
        title=professor.title,
        is_active=professor.user.is_active,
    )


def _student_option_out(db: Session, student: Student) -> StudentOptionOut:
    return StudentOptionOut(
        id=student.id,
        user_id=student.user_id,
        email=student.user.email,
        full_name=student.user.full_name,
        university_id=student.university_id,
        department_id=student.department_id,
        department_name=_department_name(db, student.department_id),
        program=student.program,
        year_level=student.year_level,
        is_active=student.user.is_active,
    )


def _course_professor_out(db: Session, course_id: str, professor: Professor, assigned_at: datetime) -> CourseProfessorOut:
    return CourseProfessorOut(
        id=f"{course_id}:{professor.id}",
        course_id=course_id,
        professor_id=professor.id,
        full_name=professor.user.full_name,
        email=professor.user.email,
        employee_id=professor.employee_id,
        department_name=_department_name(db, professor.department_id),
        assigned_at=assigned_at,
    )


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DB_Dependency) -> DashboardOut:
    counts = {
        "users": int(db.scalar(select(func.count()).select_from(User)) or 0),
        "students": int(db.scalar(select(func.count()).select_from(Student)) or 0),
        "professors": int(db.scalar(select(func.count()).select_from(Professor)) or 0),
        "departments": int(db.scalar(select(func.count()).select_from(Department)) or 0),
        "courses": int(db.scalar(select(func.count()).select_from(Course)) or 0),
        "classes": int(db.scalar(select(func.count()).select_from(Class_)) or 0),
        "active_sessions": int(
            db.scalar(select(func.count()).select_from(AttendanceSession).where(AttendanceSession.status == "active"))
            or 0
        ),
        "attendance_records": int(db.scalar(select(func.count()).select_from(AttendanceRecord)) or 0),
    }
    total = counts["attendance_records"]
    attended = int(
        db.scalar(
            select(func.count())
            .select_from(AttendanceRecord)
            .where(AttendanceRecord.status.in_(["present", "late"]))
        )
        or 0
    )
    return DashboardOut(
        counts=counts,
        attendance={
            "total": total,
            "attended": attended,
            "attendance_rate": round(attended / total, 4) if total else 0.0,
        },
    )


@router.get("/alerts", response_model=AlertsOut)
def alerts(db: DB_Dependency) -> AlertsOut:
    now = utcnow()
    items: list[AlertOut] = []
    attended_case = case((AttendanceRecord.status.in_(["present", "late"]), 1), else_=0)
    low_attendance = db.execute(
        select(
            Student.id,
            User.full_name,
            User.email,
            func.count(AttendanceRecord.id).label("total"),
            func.sum(attended_case).label("attended"),
        )
        .join(User, User.id == Student.user_id)
        .join(AttendanceRecord, AttendanceRecord.student_id == Student.id)
        .group_by(Student.id, User.full_name, User.email)
        .having(func.count(AttendanceRecord.id) >= 3)
        .having(func.sum(attended_case) * 1.0 / func.count(AttendanceRecord.id) < 0.75)
        .order_by(func.count(AttendanceRecord.id).desc())
        .limit(5)
    ).all()
    for student_id, full_name, email, total, attended_count in low_attendance:
        rate = round((attended_count or 0) / total * 100)
        items.append(
            AlertOut(
                id=f"low-attendance-{student_id}",
                title=f"Low attendance: {full_name}",
                description=f"{rate}% attendance across {total} marked sessions.",
                severity="warning",
                href=f"/admin/users?search={email}",
                created_at=now,
            )
        )

    sessions = db.scalars(
        select(AttendanceSession)
        .where(
            AttendanceSession.status == "active",
            or_(AttendanceSession.current_qr_hash.is_(None), AttendanceSession.ends_at < now),
        )
        .order_by(AttendanceSession.starts_at.desc())
        .limit(5)
    ).all()
    for session in sessions:
        overdue = session.ends_at < now
        items.append(
            AlertOut(
                id=f"session-{session.id}",
                title="Active session needs attention",
                description=(
                    f"Session ended at {session.ends_at:%H:%M} but is still active."
                    if overdue
                    else "Session is active but has no QR code."
                ),
                severity="danger" if overdue else "info",
                href="/professor/sessions",
                created_at=now,
            )
        )

    return AlertsOut(items=items[:8])


@router.get("/departments", response_model=Page[DepartmentOut])
def list_departments(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["name", "code", "created_at"] = "name",
    sort_order: Literal["asc", "desc"] = "asc",
) -> Page[DepartmentOut]:
    query = select(Department)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Department.name.ilike(pattern), Department.code.ilike(pattern)))
    query = apply_sort(query, getattr(Department, sort_by), pagination(page, page_size, sort_by, sort_order))
    return paginate(db, query, pagination(page, page_size, sort_by, sort_order))


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Department:
    _check_unique(db, Department, Department.name, payload.name, "Department name")
    _check_unique(db, Department, Department.code, payload.code, "Department code")
    department = Department(
        id=new_uuid(),
        name=payload.name,
        code=payload.code,
        description=payload.description,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(department)
    db.flush()
    write_audit_log(
        db,
        action="department.create",
        entity_type="department",
        entity_id=department.id,
        actor=actor,
        after=_snapshot(department, ["id", "name", "code", "description"]),
        request=request,
    )
    db.commit()
    db.refresh(department)
    return department


@router.get("/departments/{department_id}", response_model=DepartmentOut)
def get_department(department_id: str, db: DB_Dependency) -> Department:
    return _get_or_404(db, Department, department_id, "Department")


@router.patch("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> Department:
    department = _get_or_404(db, Department, department_id, "Department")
    if payload.name:
        _check_unique(db, Department, Department.name, payload.name, "Department name", department_id)
    if payload.code:
        _check_unique(db, Department, Department.code, payload.code, "Department code", department_id)
    before = _apply(department, payload)
    department.updated_at = utcnow()
    write_audit_log(
        db,
        action="department.update",
        entity_type="department",
        entity_id=department.id,
        actor=actor,
        before=before,
        after=_snapshot(department, ["id", "name", "code", "description"]),
        request=request,
    )
    db.commit()
    return department


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: str,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> Response:
    department = _get_or_404(db, Department, department_id, "Department")
    write_audit_log(
        db,
        action="department.delete",
        entity_type="department",
        entity_id=department.id,
        actor=actor,
        before=_snapshot(department, ["id", "name", "code"]),
        request=request,
    )
    db.delete(department)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Department is referenced by other records") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=Page[UserAdminOut])
def list_users(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Literal["admin", "professor", "student"] | None = None,
    is_active: bool | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["email", "full_name", "role", "created_at"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
) -> Page[UserAdminOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
    query = apply_sort(query, getattr(User, sort_by), params)
    result = paginate(db, query, params)
    return Page[UserAdminOut](
        items=[_user_out(db, user) for user in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


def _create_user_record(
    db: Session, payload: UserCreate, actor: User, request: Request
) -> User:
    email = str(payload.email).lower()
    _check_unique(db, User, User.email, email, "Email")
    if payload.role == "student":
        _check_unique(db, Student, Student.university_id, payload.university_id, "University ID")
    if payload.role == "professor":
        _check_unique(db, Professor, Professor.employee_id, payload.employee_id, "Employee ID")
    if payload.department_id:
        _get_or_404(db, Department, payload.department_id, "Department")

    user = User(
        id=new_uuid(),
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        phone=payload.phone,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(user)
    db.flush()
    if payload.role == "student":
        db.add(
            Student(
                id=new_uuid(),
                user_id=user.id,
                university_id=payload.university_id,
                department_id=payload.department_id,
                program=payload.program,
                year_level=payload.year_level,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    elif payload.role == "professor":
        db.add(
            Professor(
                id=new_uuid(),
                user_id=user.id,
                employee_id=payload.employee_id,
                department_id=payload.department_id,
                title=payload.title,
                office=payload.office,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.flush()
    write_audit_log(
        db,
        action="user.create",
        entity_type="user",
        entity_id=user.id,
        actor=actor,
        after={"email": user.email, "role": user.role, "full_name": user.full_name},
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "User could not be created due to duplicate identifiers") from exc
    db.refresh(user)
    return user


@router.post("/users", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> UserAdminOut:
    return _user_out(db, _create_user_record(db, payload, actor, request))


@router.post("/users/bulk", response_model=BulkImportResult)
async def bulk_import_users(
    request: Request,
    db: DB_Dependency,
    file: UploadFile = File(...),
    actor: User = Depends(require_admin),
) -> BulkImportResult:
    raw = await file.read()
    if len(raw) > 2_000_000:
        raise AppError(413, "validation_error", "CSV file exceeds the 2 MB limit")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError(422, "validation_error", "CSV file must be UTF-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise AppError(422, "validation_error", "CSV file is empty")
    missing = {"role", "full_name", "email"} - set(reader.fieldnames)
    if missing:
        raise AppError(422, "validation_error", f"CSV is missing columns: {', '.join(sorted(missing))}")
    rows = list(reader)
    if not rows:
        raise AppError(422, "validation_error", "CSV file has no data rows")
    if len(rows) > 500:
        raise AppError(422, "validation_error", "CSV import is limited to 500 rows")

    errors: list[BulkImportError] = []
    created = 0
    for row_number, row in enumerate(rows, start=2):
        values: dict[str, Any] = {key: (value or "").strip() for key, value in row.items() if key}
        values = {key: value for key, value in values.items() if value}
        email = values.get("email", "")
        try:
            department = values.pop("department", None)
            if department and not values.get("department_id"):
                department_row = db.scalar(
                    select(Department).where(
                        or_(
                            func.lower(Department.name) == department.lower(),
                            func.lower(Department.code) == department.lower(),
                        )
                    )
                )
                if department_row is None:
                    raise AppError(422, "validation_error", f"Department '{department}' was not found")
                values["department_id"] = department_row.id
            if "year_level" in values:
                try:
                    values["year_level"] = int(values["year_level"])
                except ValueError as exc:
                    raise AppError(422, "validation_error", "year_level must be a number") from exc
            payload = UserCreate(**values)
            _create_user_record(db, payload, actor, request)
            created += 1
        except (AppError, ValidationError, IntegrityError, ValueError) as exc:
            db.rollback()
            message = exc.message if isinstance(exc, AppError) else str(exc)
            errors.append(BulkImportError(row=row_number, email=email, error=message[:500]))

    return BulkImportResult(total=len(rows), created=created, failed=len(errors), errors=errors)


@router.get("/users/{user_id}", response_model=UserAdminOut)
def get_user(user_id: str, db: DB_Dependency) -> UserAdminOut:
    return _user_out(db, _get_or_404(db, User, user_id, "User"))


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> UserAdminOut:
    user = _get_or_404(db, User, user_id, "User")
    updates = payload.model_dump(exclude_unset=True)
    before: dict[str, Any] = {}
    if "email" in updates and updates["email"] is not None:
        email = str(updates["email"]).lower()
        _check_unique(db, User, User.email, email, "Email", user_id)
        updates["email"] = email
    if "password" in updates:
        password = updates.pop("password")
        if password is not None:
            before["hashed_password"] = "<redacted>"
            updates["hashed_password"] = hash_password(password)

    profile_fields = {
        "department_id",
        "university_id",
        "employee_id",
        "program",
        "year_level",
        "title",
        "office",
    }
    profile_updates = {key: updates.pop(key) for key in list(updates) if key in profile_fields}
    for key, value in updates.items():
        if value is None and key not in {"email", "full_name", "phone", "is_active", "hashed_password"}:
            continue
        before.setdefault(key, getattr(user, key, None))
        setattr(user, key, value)

    student = db.scalar(select(Student).where(Student.user_id == user.id))
    professor = db.scalar(select(Professor).where(Professor.user_id == user.id))
    profile = student or professor
    if profile_updates and profile is None:
        raise AppError(422, "validation_error", "Profile fields require a student or professor account")
    if profile_updates.get("department_id"):
        _get_or_404(db, Department, profile_updates["department_id"], "Department")
    if profile_updates.get("university_id") and student:
        _check_unique(db, Student, Student.university_id, profile_updates["university_id"], "University ID", student.id)
    if profile_updates.get("employee_id") and professor:
        _check_unique(db, Professor, Professor.employee_id, profile_updates["employee_id"], "Employee ID", professor.id)
    for key, value in profile_updates.items():
        if value is None and key not in {"department_id", "university_id", "employee_id", "program", "year_level", "title", "office"}:
            continue
        before.setdefault(f"profile.{key}", getattr(profile, key, None))
        setattr(profile, key, value)

    user.updated_at = utcnow()
    write_audit_log(
        db,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        actor=actor,
        before=before,
        after={"email": user.email, "full_name": user.full_name, "is_active": user.is_active},
        request=request,
    )
    db.commit()
    return _user_out(db, user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    if user_id == actor.id:
        raise AppError(409, "conflict", "Administrators cannot delete their own account")
    user = _get_or_404(db, User, user_id, "User")
    write_audit_log(
        db,
        action="user.delete",
        entity_type="user",
        entity_id=user.id,
        actor=actor,
        before={"email": user.email, "role": user.role},
        request=request,
    )
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/reset-password", response_model=UserAdminOut)
def reset_user_password(
    user_id: str,
    payload: PasswordResetIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> UserAdminOut:
    user = _get_or_404(db, User, user_id, "User")
    if user.role == "admin":
        raise AppError(409, "conflict", "Admin passwords cannot be reset from user management")
    user.hashed_password = hash_password(payload.password)
    user.updated_at = utcnow()
    revoked_at = utcnow()
    revoked = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": revoked_at}, synchronize_session=False)
    write_audit_log(
        db,
        action="user.password_reset",
        entity_type="user",
        entity_id=user.id,
        actor=actor,
        before={"hashed_password": "<redacted>"},
        after={"revoked_sessions": revoked},
        request=request,
    )
    db.commit()
    return _user_out(db, user)


@router.get("/professors", response_model=Page[ProfessorOptionOut])
def list_professors(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["full_name", "email", "employee_id", "created_at"] = "full_name",
    sort_order: Literal["asc", "desc"] = "asc",
) -> Page[ProfessorOptionOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(Professor).join(User, User.id == Professor.user_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                Professor.employee_id.ilike(pattern),
            )
        )
    sort_column: Any
    if sort_by == "created_at":
        sort_column = Professor.created_at
    elif sort_by == "employee_id":
        sort_column = Professor.employee_id
    else:
        sort_column = getattr(User, sort_by)
    query = apply_sort(query, sort_column, params)
    result = paginate(db, query, params)
    return Page[ProfessorOptionOut](
        items=[_professor_option_out(db, professor) for professor in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/students", response_model=Page[StudentOptionOut])
def list_students(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["full_name", "email", "university_id", "created_at"] = "full_name",
    sort_order: Literal["asc", "desc"] = "asc",
) -> Page[StudentOptionOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(Student).join(User, User.id == Student.user_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                Student.university_id.ilike(pattern),
            )
        )
    sort_column: Any
    if sort_by == "created_at":
        sort_column = Student.created_at
    elif sort_by == "university_id":
        sort_column = Student.university_id
    else:
        sort_column = getattr(User, sort_by)
    query = apply_sort(query, sort_column, params)
    result = paginate(db, query, params)
    return Page[StudentOptionOut](
        items=[_student_option_out(db, student) for student in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/courses", response_model=Page[CourseOut])
def list_courses(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: str | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["code", "name", "created_at"] = "code",
    sort_order: Literal["asc", "desc"] = "asc",
) -> Page[CourseOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(Course)
    if department_id:
        query = query.where(Course.department_id == department_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Course.code.ilike(pattern), Course.name.ilike(pattern)))
    query = apply_sort(query, getattr(Course, sort_by), params)
    result = paginate(db, query, params)
    return Page[CourseOut](
        items=[_course_out(db, course) for course in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> CourseOut:
    _check_unique(db, Course, Course.code, payload.code, "Course code")
    _get_or_404(db, Department, payload.department_id, "Department")
    course = Course(
        id=new_uuid(),
        code=payload.code,
        name=payload.name,
        credits=payload.credits,
        department_id=payload.department_id,
        description=payload.description,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(course)
    db.flush()
    write_audit_log(
        db,
        action="course.create",
        entity_type="course",
        entity_id=course.id,
        actor=actor,
        after=_snapshot(course, ["id", "code", "name", "credits", "department_id"]),
        request=request,
    )
    db.commit()
    db.refresh(course)
    return _course_out(db, course)


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: str, db: DB_Dependency) -> CourseOut:
    return _course_out(db, _get_or_404(db, Course, course_id, "Course"))


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: str,
    payload: CourseUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> CourseOut:
    course = _get_or_404(db, Course, course_id, "Course")
    if payload.code:
        _check_unique(db, Course, Course.code, payload.code, "Course code", course_id)
    if payload.department_id:
        _get_or_404(db, Department, payload.department_id, "Department")
    before = _apply(course, payload)
    course.updated_at = utcnow()
    write_audit_log(
        db,
        action="course.update",
        entity_type="course",
        entity_id=course.id,
        actor=actor,
        before=before,
        after=_snapshot(course, ["id", "code", "name", "credits", "department_id"]),
        request=request,
    )
    db.commit()
    return _course_out(db, course)


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    course = _get_or_404(db, Course, course_id, "Course")
    write_audit_log(
        db,
        action="course.delete",
        entity_type="course",
        entity_id=course.id,
        actor=actor,
        before=_snapshot(course, ["id", "code", "name"]),
        request=request,
    )
    db.delete(course)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/courses/{course_id}/professors", response_model=list[CourseProfessorOut])
def list_course_professors(course_id: str, db: DB_Dependency) -> list[CourseProfessorOut]:
    _get_or_404(db, Course, course_id, "Course")
    rows = db.execute(
        select(course_professors)
        .where(course_professors.c.course_id == course_id)
        .order_by(course_professors.c.created_at)
    ).mappings().all()
    result: list[CourseProfessorOut] = []
    for row in rows:
        professor = db.get(Professor, row["professor_id"])
        if professor:
            result.append(_course_professor_out(db, course_id, professor, row["created_at"]))
    return result


@router.post(
    "/courses/{course_id}/professors/{professor_id}",
    response_model=CourseProfessorOut,
    status_code=status.HTTP_201_CREATED,
)
def assign_professor_to_course(
    course_id: str,
    professor_id: str,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> CourseProfessorOut:
    _get_or_404(db, Course, course_id, "Course")
    professor = _get_or_404(db, Professor, professor_id, "Professor")
    existing = db.execute(
        select(course_professors).where(
            course_professors.c.course_id == course_id,
            course_professors.c.professor_id == professor_id,
        )
    ).first()
    if existing:
        raise AppError(409, "conflict", "Professor is already assigned to this course")
    assigned_at = utcnow()
    db.execute(
        course_professors.insert().values(
            course_id=course_id, professor_id=professor_id, created_at=assigned_at
        )
    )
    write_audit_log(
        db,
        action="course_professor.assign",
        entity_type="course_professor",
        entity_id=f"{course_id}:{professor_id}",
        actor=actor,
        after={"course_id": course_id, "professor_id": professor_id},
        request=request,
    )
    db.commit()
    return _course_professor_out(db, course_id, professor, assigned_at)


@router.delete(
    "/courses/{course_id}/professors/{professor_id}", status_code=status.HTTP_204_NO_CONTENT
)
def unassign_professor_from_course(
    course_id: str,
    professor_id: str,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> Response:
    row = db.execute(
        select(course_professors).where(
            course_professors.c.course_id == course_id,
            course_professors.c.professor_id == professor_id,
        )
    ).first()
    if row is None:
        raise AppError(404, "not_found", "Course professor assignment not found")
    db.execute(
        course_professors.delete().where(
            course_professors.c.course_id == course_id,
            course_professors.c.professor_id == professor_id,
        )
    )
    write_audit_log(
        db,
        action="course_professor.unassign",
        entity_type="course_professor",
        entity_id=f"{course_id}:{professor_id}",
        actor=actor,
        before={"course_id": course_id, "professor_id": professor_id},
        request=request,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/classes", response_model=Page[ClassOut])
def list_classes(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    course_id: str | None = None,
    professor_id: str | None = None,
    department_id: str | None = None,
    is_active: bool | None = None,
    search: str | None = Query(None, max_length=100),
    sort_by: Literal["section", "term", "created_at"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
) -> Page[ClassOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(Class_)
    if course_id:
        query = query.where(Class_.course_id == course_id)
    if professor_id:
        query = query.where(Class_.professor_id == professor_id)
    if department_id:
        query = query.where(Class_.department_id == department_id)
    if is_active is not None:
        query = query.where(Class_.is_active == is_active)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Class_.section.ilike(pattern), Class_.term.ilike(pattern), Class_.name.ilike(pattern)))
    query = apply_sort(query, getattr(Class_, sort_by), params)
    result = paginate(db, query, params)
    return Page[ClassOut](
        items=[class_service.class_to_out(db, class_) for class_ in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


def _validate_class_refs(db: Session, payload: Any) -> None:
    _get_or_404(db, Course, payload.course_id, "Course")
    if payload.professor_id:
        _get_or_404(db, Professor, payload.professor_id, "Professor")
    if payload.department_id:
        _get_or_404(db, Department, payload.department_id, "Department")


@router.post("/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(
    payload: ClassCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> ClassOut:
    _validate_class_refs(db, payload)
    class_ = Class_(
        id=new_uuid(),
        course_id=payload.course_id,
        professor_id=payload.professor_id,
        department_id=payload.department_id,
        section=payload.section,
        term=payload.term,
        name=payload.name,
        capacity=payload.capacity,
        is_active=payload.is_active,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(class_)
    db.flush()
    write_audit_log(
        db,
        action="class.create",
        entity_type="class",
        entity_id=class_.id,
        actor=actor,
        after=_snapshot(class_, ["id", "course_id", "professor_id", "section", "term"]),
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Class with this course, section, and term already exists") from exc
    db.refresh(class_)
    return class_service.class_to_out(db, class_)


@router.get("/classes/{class_id}", response_model=ClassOut)
def get_class(class_id: str, db: DB_Dependency) -> ClassOut:
    return class_service.class_to_out(db, _get_or_404(db, Class_, class_id, "Class"))


@router.patch("/classes/{class_id}", response_model=ClassOut)
def update_class(
    class_id: str,
    payload: ClassUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> ClassOut:
    class_ = _get_or_404(db, Class_, class_id, "Class")
    if payload.course_id:
        _get_or_404(db, Course, payload.course_id, "Course")
    if payload.professor_id:
        _get_or_404(db, Professor, payload.professor_id, "Professor")
    before = _apply(class_, payload)
    class_.updated_at = utcnow()
    write_audit_log(
        db,
        action="class.update",
        entity_type="class",
        entity_id=class_.id,
        actor=actor,
        before=before,
        after=_snapshot(class_, ["id", "course_id", "professor_id", "section", "term", "capacity"]),
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Class update conflicts with an existing class") from exc
    return class_service.class_to_out(db, class_)


@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(
    class_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    class_ = _get_or_404(db, Class_, class_id, "Class")
    write_audit_log(
        db,
        action="class.delete",
        entity_type="class",
        entity_id=class_.id,
        actor=actor,
        before=_snapshot(class_, ["id", "course_id", "section", "term"]),
        request=request,
    )
    db.delete(class_)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/classes/{class_id}/enrollments", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED
)
def enroll_student(
    class_id: str,
    payload: EnrollmentCreate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> Enrollment:
    _get_or_404(db, Class_, class_id, "Class")
    student = db.get(Student, payload.student_id)
    if student is None:
        raise AppError(404, "not_found", "Student not found")
    if db.scalar(
        select(Enrollment).where(Enrollment.class_id == class_id, Enrollment.student_id == student.id)
    ):
        raise AppError(409, "conflict", "Student is already enrolled in this class")
    enrollment = Enrollment(
        id=new_uuid(),
        class_id=class_id,
        student_id=student.id,
        status="enrolled",
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(enrollment)
    db.flush()
    write_audit_log(
        db,
        action="enrollment.create",
        entity_type="enrollment",
        entity_id=enrollment.id,
        actor=actor,
        after={"class_id": class_id, "student_id": student.id},
        request=request,
    )
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.delete("/classes/{class_id}/enrollments/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def unenroll_student(
    class_id: str,
    student_id: str,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> Response:
    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.class_id == class_id, Enrollment.student_id == student_id)
    )
    if enrollment is None:
        raise AppError(404, "not_found", "Enrollment not found")
    write_audit_log(
        db,
        action="enrollment.delete",
        entity_type="enrollment",
        entity_id=enrollment.id,
        actor=actor,
        before={"class_id": class_id, "student_id": student_id},
        request=request,
    )
    db.delete(enrollment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/schedules", response_model=Page[ScheduleOut])
def list_schedules(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    class_id: str | None = None,
    classroom_id: str | None = None,
    day_of_week: int | None = Query(None, ge=0, le=6),
    sort_by: Literal["day_of_week", "start_time", "created_at"] = "day_of_week",
    sort_order: Literal["asc", "desc"] = "asc",
) -> Page[ScheduleOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(Schedule)
    if class_id:
        query = query.where(Schedule.class_id == class_id)
    if classroom_id:
        query = query.where(Schedule.classroom_id == classroom_id)
    if day_of_week is not None:
        query = query.where(Schedule.day_of_week == day_of_week)
    query = apply_sort(query, getattr(Schedule, sort_by), params)
    result = paginate(db, query, params)
    return Page[ScheduleOut](
        items=[class_service.schedule_to_out(db, schedule) for schedule in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.post("/schedules", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ScheduleCreate, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> ScheduleOut:
    _get_or_404(db, Class_, payload.class_id, "Class")
    if payload.classroom_id:
        _get_or_404(db, Classroom, payload.classroom_id, "Classroom")
    schedule = Schedule(
        id=new_uuid(),
        class_id=payload.class_id,
        classroom_id=payload.classroom_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    try:
        db.add(schedule)
        db.flush()
        write_audit_log(
            db,
            action="schedule.create",
            entity_type="schedule",
            entity_id=schedule.id,
            actor=actor,
            after=_snapshot(schedule, ["id", "class_id", "classroom_id", "day_of_week", "start_time", "end_time"]),
            request=request,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Schedule already exists for this class, day, and start time") from exc
    db.refresh(schedule)
    return class_service.schedule_to_out(db, schedule)


@router.get("/schedules/{schedule_id}", response_model=ScheduleOut)
def get_schedule(schedule_id: str, db: DB_Dependency) -> ScheduleOut:
    return class_service.schedule_to_out(db, _get_or_404(db, Schedule, schedule_id, "Schedule"))


@router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
def update_schedule(
    schedule_id: str,
    payload: ScheduleUpdate,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> ScheduleOut:
    schedule = _get_or_404(db, Schedule, schedule_id, "Schedule")
    updates = payload.model_dump(exclude_unset=True)
    before = _snapshot(schedule, list(updates))
    for key, value in updates.items():
        setattr(schedule, key, value)
    _get_or_404(db, Class_, schedule.class_id, "Class")
    if schedule.classroom_id:
        _get_or_404(db, Classroom, schedule.classroom_id, "Classroom")
    if schedule.end_time <= schedule.start_time:
        raise AppError(422, "validation_error", "end_time must be later than start_time")
    schedule.updated_at = utcnow()
    write_audit_log(
        db,
        action="schedule.update",
        entity_type="schedule",
        entity_id=schedule.id,
        actor=actor,
        before=before,
        after=_snapshot(schedule, ["id", "class_id", "classroom_id", "day_of_week", "start_time", "end_time"]),
        request=request,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "conflict", "Schedule already exists for this class, day, and start time") from exc
    return class_service.schedule_to_out(db, schedule)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: str, request: Request, db: DB_Dependency, actor: User = Depends(require_admin)
) -> Response:
    schedule = _get_or_404(db, Schedule, schedule_id, "Schedule")
    write_audit_log(
        db,
        action="schedule.delete",
        entity_type="schedule",
        entity_id=schedule.id,
        actor=actor,
        before=_snapshot(schedule, ["id", "class_id", "classroom_id", "day_of_week", "start_time", "end_time"]),
        request=request,
    )
    db.delete(schedule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/face/status/{student_id}", response_model=FaceStatusOut)
def admin_face_status(student_id: str, db: DB_Dependency) -> FaceStatusOut:
    student = _resolve_student(db, student_id)
    consent = student.consent
    count = face_service.active_embedding_count(db, student)
    return FaceStatusOut(
        is_registered=count > 0,
        embedding_count=count,
        model_name=settings.face_model_name,
        consent_version=consent.consent_version if consent else None,
        consented_at=consent.consented_at if consent else None,
        requires_new_consent=consent is None
        or not consent.is_active
        or consent.consent_version != settings.biometric_consent_version,
        liveness_min_frames=settings.face_liveness_min_frames,
    )


@router.post("/face/register/{student_id}", response_model=FaceRegisterOut, status_code=status.HTTP_201_CREATED)
@face_register_limit
def admin_register_face(
    student_id: str,
    payload: AdminFaceRegisterIn,
    request: Request,
    db: DB_Dependency,
    actor: User = Depends(require_admin),
) -> FaceRegisterOut:
    if payload.consent_version != settings.biometric_consent_version:
        raise AppError(
            422,
            "validation_error",
            "Biometric consent version is outdated",
            {"expected_version": settings.biometric_consent_version},
        )
    student = _resolve_student(db, student_id)
    analysis = face_service.analyze_frames(payload.frames)
    count = face_service.register_embeddings(db, student, analysis)
    face_service.set_consent(db, student, payload.consent_version)
    write_audit_log(
        db,
        action="face.register_admin",
        entity_type="student",
        entity_id=student.id,
        actor=actor,
        after={
            "embedding_count": count,
            "consent_version": payload.consent_version,
            "consent_reference": payload.consent_reference,
            "consent_confirmed_by": actor.id,
            "model": settings.face_model_name,
        },
        reason=f"Admin-recorded biometric consent: {payload.consent_reference}",
        request=request,
    )
    db.commit()
    return FaceRegisterOut(
        embedding_count=count,
        model_name=settings.face_model_name,
        consent_version=payload.consent_version,
        similarity_threshold=settings.face_match_threshold,
    )


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def list_audit_logs(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor_id: str | None = None,
    action: str | None = Query(None, max_length=100),
    entity_type: str | None = Query(None, max_length=60),
    entity_id: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    sort_by: Literal["created_at", "action", "entity_type"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
) -> Page[AuditLogOut]:
    params = pagination(page, page_size, sort_by, sort_order)
    query = select(AuditLog)
    if actor_id:
        query = query.where(AuditLog.actor_user_id == actor_id)
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    if from_date:
        query = query.where(AuditLog.created_at >= from_date)
    if to_date:
        query = query.where(AuditLog.created_at <= to_date)
    query = apply_sort(query, getattr(AuditLog, sort_by), params)
    return paginate(db, query, params)

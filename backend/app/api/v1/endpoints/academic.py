from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select

from app.api.v1.endpoints._helpers import pagination
from app.core.deps import (
    DB_Dependency,
    get_current_user,
    professor_profile,
    require_professor,
    require_student,
    student_profile,
)
from app.models import (
    Class_,
    Classroom,
    Course,
    Department,
    Enrollment,
    Professor,
    Schedule,
    Semester,
    User,
)
from app.schemas.academic import (
    ClassroomOption,
    CourseOption,
    DepartmentOption,
    SemesterOption,
    StudentScheduleItem,
)
from app.schemas.admin import ClassOut
from app.schemas.common import Page, apply_sort, paginate
from app.services.class_service import DAY_LABELS, class_to_out, professor_class_filter

router = APIRouter(prefix="", tags=["academic"], dependencies=[Depends(get_current_user)])


@router.get("/departments", response_model=Page[DepartmentOption])
def list_departments(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
) -> Page[DepartmentOption]:
    params = pagination(page, page_size, "name", "asc")
    query = select(Department)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Department.name.ilike(pattern), Department.code.ilike(pattern)))
    query = apply_sort(query, Department.name, params)
    return paginate(db, query, params)


@router.get("/semesters", response_model=Page[SemesterOption])
def list_semesters(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    is_active: bool | None = None,
) -> Page[SemesterOption]:
    params = pagination(page, page_size, "academic_year", "desc")
    query = select(Semester)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Semester.name.ilike(pattern),
                Semester.code.ilike(pattern),
                Semester.academic_year.ilike(pattern),
            )
        )
    if is_active is not None:
        query = query.where(Semester.is_active == is_active)
    query = query.order_by(Semester.academic_year.desc(), Semester.start_date.desc(), Semester.name.asc())
    return paginate(db, query, params)


@router.get("/courses", response_model=Page[CourseOption])
def list_courses(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: str | None = None,
    search: str | None = Query(None, max_length=100),
) -> Page[CourseOption]:
    params = pagination(page, page_size, "code", "asc")
    query = select(Course)
    if department_id:
        query = query.where(Course.department_id == department_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(Course.code.ilike(pattern), Course.name.ilike(pattern)))
    query = apply_sort(query, Course.code, params)
    return paginate(db, query, params)


@router.get("/classrooms", response_model=Page[ClassroomOption])
def list_classrooms(
    db: DB_Dependency,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
) -> Page[ClassroomOption]:
    params = pagination(page, page_size, "name", "asc")
    query = select(Classroom).where(Classroom.is_active.is_(True))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(Classroom.name.ilike(pattern), Classroom.building.ilike(pattern), Classroom.room.ilike(pattern))
        )
    query = apply_sort(query, Classroom.name, params)
    return paginate(db, query, params)


@router.get("/professor/classes", response_model=Page[ClassOut])
def professor_classes(
    db: DB_Dependency,
    user: User = Depends(require_professor),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    term: str | None = None,
    semester_id: str | None = None,
) -> Page[ClassOut]:
    params = pagination(page, page_size, "created_at", "desc")
    professor = professor_profile(db, user)
    query = select(Class_).where(professor_class_filter(professor.id))
    if term:
        query = query.where(Class_.term == term)
    if semester_id:
        query = query.where(Class_.semester_id == semester_id)
    query = apply_sort(query, Class_.created_at, params)
    result = paginate(db, query, params)
    return Page[ClassOut](
        items=[class_to_out(db, class_) for class_ in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/student/classes", response_model=Page[ClassOut])
def student_classes(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    term: str | None = None,
    semester_id: str | None = None,
) -> Page[ClassOut]:
    params = pagination(page, page_size, "created_at", "desc")
    student = student_profile(db, user)
    query = (
        select(Class_)
        .join(Enrollment, Enrollment.class_id == Class_.id)
        .where(Enrollment.student_id == student.id, Enrollment.status == "enrolled")
    )
    if term:
        query = query.where(Class_.term == term)
    if semester_id:
        query = query.where(Class_.semester_id == semester_id)
    query = apply_sort(query, Class_.created_at, params)
    result = paginate(db, query, params)
    return Page[ClassOut](
        items=[class_to_out(db, class_) for class_ in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )


@router.get("/student/schedule", response_model=Page[StudentScheduleItem])
def student_schedule(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[StudentScheduleItem]:
    params = pagination(page, page_size, "start_time", "asc")
    student = student_profile(db, user)
    query = (
        select(Schedule)
        .join(Class_, Schedule.class_id == Class_.id)
        .join(Course, Class_.course_id == Course.id)
        .join(Enrollment, Enrollment.class_id == Class_.id)
        .where(Enrollment.student_id == student.id, Enrollment.status == "enrolled")
    )
    query = apply_sort(query, Schedule.start_time, params)
    result = paginate(db, query, params)
    items: list[StudentScheduleItem] = []
    for schedule in result.items:
        class_ = db.get(Class_, schedule.class_id)
        if class_ is None:
            continue
        course = db.get(Course, class_.course_id)
        if course is None:
            continue
        classroom = db.get(Classroom, schedule.classroom_id) if schedule.classroom_id else None
        professor_name = None
        if class_.professor_id:
            professor = db.get(Professor, class_.professor_id)
            user_row = db.get(User, professor.user_id) if professor else None
            professor_name = user_row.full_name if user_row else None
        items.append(
            StudentScheduleItem(
                id=schedule.id,
                class_id=class_.id,
                class_name=class_.name or f"{course.code}-{class_.section}",
                course_id=course.id,
                course_name=course.name,
                professor_name=professor_name,
                classroom_id=classroom.id if classroom else None,
                classroom_name=classroom.name if classroom else None,
                day_of_week=schedule.day_of_week,
                day_name=DAY_LABELS[schedule.day_of_week] if 0 <= schedule.day_of_week <= 6 else "Unknown",
                start_time=schedule.start_time,
                end_time=schedule.end_time,
            )
        )
    return Page[StudentScheduleItem](
        items=items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        pages=result.pages,
    )

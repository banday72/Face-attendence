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
from app.models import Class_, Classroom, Course, Department, Enrollment, User
from app.schemas.academic import ClassroomOption, CourseOption, DepartmentOption
from app.schemas.admin import ClassOut
from app.schemas.common import Page, apply_sort, paginate

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
) -> Page[ClassOut]:
    params = pagination(page, page_size, "created_at", "desc")
    professor = professor_profile(db, user)
    query = select(Class_).where(Class_.professor_id == professor.id)
    if term:
        query = query.where(Class_.term == term)
    query = apply_sort(query, Class_.created_at, params)
    return paginate(db, query, params)


@router.get("/student/classes", response_model=Page[ClassOut])
def student_classes(
    db: DB_Dependency,
    user: User = Depends(require_student),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    term: str | None = None,
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
    query = apply_sort(query, Class_.created_at, params)
    return paginate(db, query, params)

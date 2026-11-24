from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

T = TypeVar("T")

SORT_PATTERN = r"^[a-zA-Z_][a-zA-Z0-9_\.]*$"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ORMModel(StrictModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid", str_strip_whitespace=True)


class PaginationParams(StrictModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str | None = Field(default=None, pattern=SORT_PATTERN)
    sort_order: Literal["asc", "desc"] = "asc"


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def paginate(db: Session, query: Select, params: PaginationParams) -> Page[Any]:
    count_query = query.options().order_by(None)
    total = db.scalar(select(func.count()).select_from(count_query.subquery())) or 0
    items = db.scalars(query.offset((params.page - 1) * params.page_size).limit(params.page_size)).all()
    return Page[Any](
        items=list(items),
        total=total,
        page=params.page,
        page_size=params.page_size,
        pages=(total + params.page_size - 1) // params.page_size,
    )


def apply_sort(query: Select, column: Any, params: PaginationParams) -> Select:
    return query.order_by(asc(column) if params.sort_order == "asc" else desc(column))

"""Database models.

Hierarchy: Workspace -> TaskList -> Task.

`owner_id` and the calendar fields are placeholders for the planned user
accounts and calendar sync; nothing reads them yet.
"""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Status(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Workspace(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    color: str = "#4f46e5"
    owner_id: Optional[int] = Field(default=None, index=True)  # future: user accounts
    created_at: datetime = Field(default_factory=utcnow)


class TaskList(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspace.id", index=True)
    name: str
    slug: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    list_id: int = Field(foreign_key="tasklist.id", index=True)
    title: str
    notes: str = ""
    status: Status = Status.todo
    priority: Priority = Priority.medium
    due_date: Optional[date] = None
    position: float = 0
    # future: calendar sync
    calendar_event_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None

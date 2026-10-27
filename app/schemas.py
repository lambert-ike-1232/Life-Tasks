from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from .models import Priority, Status


class WorkspaceCreate(SQLModel):
    name: str
    color: str = "#4f46e5"


class WorkspaceUpdate(SQLModel):
    name: Optional[str] = None
    color: Optional[str] = None


class WorkspaceRead(SQLModel):
    id: int
    name: str
    slug: str
    color: str


class ListCreate(SQLModel):
    name: str


class ListUpdate(SQLModel):
    name: Optional[str] = None
    workspace_id: Optional[int] = None


class ListRead(SQLModel):
    id: int
    workspace_id: int
    name: str
    slug: str
    open_tasks: int = 0


class TaskCreate(SQLModel):
    title: str
    notes: str = ""
    status: Status = Status.todo
    priority: Priority = Priority.medium
    due_date: Optional[date] = None


class TaskUpdate(SQLModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    due_date: Optional[date] = None
    position: Optional[float] = None
    list_id: Optional[int] = None


class TaskRead(SQLModel):
    id: int
    list_id: int
    list_name: str
    workspace_id: int
    workspace_name: str
    title: str
    notes: str
    status: Status
    priority: Priority
    due_date: Optional[date]
    position: float
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]


class QuickAdd(SQLModel):
    """Natural-ish input for assistants. Names are matched loosely
    ("shopping" finds "Shopping List"); a missing list is created."""

    title: str = Field(description="What to do, e.g. 'milk'")
    list: Optional[str] = Field(default=None, description="List name, e.g. 'shopping list'. Defaults to 'To Do'.")
    workspace: Optional[str] = Field(
        default=None,
        description="Workspace name, e.g. 'personal'. If omitted, the list is searched for across workspaces, then Personal is used.",
    )
    notes: str = ""
    priority: Priority = Priority.medium
    due_date: Optional[date] = None


class QuickAddResult(SQLModel):
    task: TaskRead
    created_list: bool
    message: str

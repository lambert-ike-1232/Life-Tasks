import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlmodel import Session, select

from .db import get_session, init_db
from .models import Status, Task, TaskList, Workspace, utcnow
from .resolve import best_match, slugify
from .schemas import (
    ListCreate,
    ListRead,
    ListUpdate,
    QuickAdd,
    QuickAddResult,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)

STATIC_DIR = Path(__file__).parent / "static"
DEFAULT_WORKSPACE = "Personal"
DEFAULT_LIST = "To Do"


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """If LIFE_TASKS_API_KEY is set, every /api call must send it as X-API-Key.
    Stand-in until real user accounts exist."""
    expected = os.environ.get("LIFE_TASKS_API_KEY")
    if expected and x_api_key != expected:
        raise HTTPException(401, "Missing or wrong X-API-Key header")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Life Tasks",
    description="A Jira-style board for life: workspaces hold lists, lists hold tasks. "
    "Assistants should prefer POST /api/quick-add and GET /api/overview.",
    version="0.1.0",
    lifespan=lifespan,
)
api = APIRouter(prefix="/api", dependencies=[Depends(require_api_key)])


# --- helpers ---------------------------------------------------------------


def get_or_404(session: Session, model, id: int):
    obj = session.get(model, id)
    if not obj:
        raise HTTPException(404, f"{model.__name__} {id} not found")
    return obj


def task_read(session: Session, task: Task) -> TaskRead:
    lst = session.get(TaskList, task.list_id)
    ws = session.get(Workspace, lst.workspace_id)
    return TaskRead(
        **task.model_dump(),
        list_name=lst.name,
        workspace_id=ws.id,
        workspace_name=ws.name,
    )


def list_read(session: Session, lst: TaskList) -> ListRead:
    open_count = session.exec(
        select(func.count()).select_from(Task).where(Task.list_id == lst.id, Task.status != Status.done)
    ).one()
    return ListRead(**lst.model_dump(), open_tasks=open_count)


def apply_status(task: Task, status: Status) -> None:
    task.status = status
    task.completed_at = utcnow() if status == Status.done else None


def next_position(session: Session, list_id: int) -> float:
    top = session.exec(select(func.max(Task.position)).where(Task.list_id == list_id)).one()
    return (top or 0) + 1


# --- workspaces ------------------------------------------------------------


@api.get("/workspaces", response_model=list[WorkspaceRead], tags=["workspaces"])
def list_workspaces(session: Session = Depends(get_session)):
    return session.exec(select(Workspace).order_by(Workspace.id)).all()


@api.post("/workspaces", response_model=WorkspaceRead, status_code=201, tags=["workspaces"])
def create_workspace(body: WorkspaceCreate, session: Session = Depends(get_session)):
    slug = slugify(body.name)
    if session.exec(select(Workspace).where(Workspace.slug == slug)).first():
        raise HTTPException(409, f"Workspace '{body.name}' already exists")
    ws = Workspace(name=body.name, slug=slug, color=body.color)
    session.add(ws)
    session.commit()
    session.refresh(ws)
    return ws


@api.patch("/workspaces/{workspace_id}", response_model=WorkspaceRead, tags=["workspaces"])
def update_workspace(workspace_id: int, body: WorkspaceUpdate, session: Session = Depends(get_session)):
    ws = get_or_404(session, Workspace, workspace_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        ws.slug = slugify(data["name"])
    for k, v in data.items():
        setattr(ws, k, v)
    session.commit()
    session.refresh(ws)
    return ws


@api.delete("/workspaces/{workspace_id}", status_code=204, tags=["workspaces"])
def delete_workspace(workspace_id: int, session: Session = Depends(get_session)):
    ws = get_or_404(session, Workspace, workspace_id)
    for lst in session.exec(select(TaskList).where(TaskList.workspace_id == ws.id)).all():
        _delete_list(session, lst)
    session.delete(ws)
    session.commit()


# --- lists -----------------------------------------------------------------


@api.get("/workspaces/{workspace_id}/lists", response_model=list[ListRead], tags=["lists"])
def list_lists(workspace_id: int, session: Session = Depends(get_session)):
    get_or_404(session, Workspace, workspace_id)
    lists = session.exec(select(TaskList).where(TaskList.workspace_id == workspace_id).order_by(TaskList.id)).all()
    return [list_read(session, l) for l in lists]


@api.post("/workspaces/{workspace_id}/lists", response_model=ListRead, status_code=201, tags=["lists"])
def create_list(workspace_id: int, body: ListCreate, session: Session = Depends(get_session)):
    get_or_404(session, Workspace, workspace_id)
    lst = TaskList(workspace_id=workspace_id, name=body.name, slug=slugify(body.name))
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return list_read(session, lst)


@api.patch("/lists/{list_id}", response_model=ListRead, tags=["lists"])
def update_list(list_id: int, body: ListUpdate, session: Session = Depends(get_session)):
    lst = get_or_404(session, TaskList, list_id)
    data = body.model_dump(exclude_unset=True)
    if "workspace_id" in data:
        get_or_404(session, Workspace, data["workspace_id"])
    if "name" in data:
        lst.slug = slugify(data["name"])
    for k, v in data.items():
        setattr(lst, k, v)
    session.commit()
    session.refresh(lst)
    return list_read(session, lst)


def _delete_list(session: Session, lst: TaskList) -> None:
    for t in session.exec(select(Task).where(Task.list_id == lst.id)).all():
        session.delete(t)
    session.delete(lst)


@api.delete("/lists/{list_id}", status_code=204, tags=["lists"])
def delete_list(list_id: int, session: Session = Depends(get_session)):
    _delete_list(session, get_or_404(session, TaskList, list_id))
    session.commit()


# --- tasks -----------------------------------------------------------------


@api.get("/tasks", response_model=list[TaskRead], tags=["tasks"])
def search_tasks(
    workspace_id: Optional[int] = None,
    list_id: Optional[int] = None,
    status: Optional[Status] = None,
    q: Optional[str] = Query(default=None, description="Substring match on title and notes"),
    due_before: Optional[date] = Query(default=None, description="Due on or before this date"),
    include_done: bool = True,
    session: Session = Depends(get_session),
):
    stmt = select(Task).join(TaskList)
    if workspace_id is not None:
        stmt = stmt.where(TaskList.workspace_id == workspace_id)
    if list_id is not None:
        stmt = stmt.where(Task.list_id == list_id)
    if status is not None:
        stmt = stmt.where(Task.status == status)
    elif not include_done:
        stmt = stmt.where(Task.status != Status.done)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Task.title.ilike(like) | Task.notes.ilike(like))
    if due_before is not None:
        stmt = stmt.where(Task.due_date.is_not(None), Task.due_date <= due_before)
    tasks = session.exec(stmt.order_by(Task.position)).all()
    return [task_read(session, t) for t in tasks]


@api.post("/lists/{list_id}/tasks", response_model=TaskRead, status_code=201, tags=["tasks"])
def create_task(list_id: int, body: TaskCreate, session: Session = Depends(get_session)):
    get_or_404(session, TaskList, list_id)
    task = Task(list_id=list_id, position=next_position(session, list_id), **body.model_dump(exclude={"status"}))
    apply_status(task, body.status)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_read(session, task)


@api.get("/tasks/{task_id}", response_model=TaskRead, tags=["tasks"])
def get_task(task_id: int, session: Session = Depends(get_session)):
    return task_read(session, get_or_404(session, Task, task_id))


@api.patch("/tasks/{task_id}", response_model=TaskRead, tags=["tasks"])
def update_task(task_id: int, body: TaskUpdate, session: Session = Depends(get_session)):
    task = get_or_404(session, Task, task_id)
    data = body.model_dump(exclude_unset=True)
    if "list_id" in data:
        get_or_404(session, TaskList, data["list_id"])
    if "status" in data:
        apply_status(task, data.pop("status"))
    for k, v in data.items():
        setattr(task, k, v)
    task.updated_at = utcnow()
    session.commit()
    session.refresh(task)
    return task_read(session, task)


@api.delete("/tasks/{task_id}", status_code=204, tags=["tasks"])
def delete_task(task_id: int, session: Session = Depends(get_session)):
    session.delete(get_or_404(session, Task, task_id))
    session.commit()


# --- assistant-friendly ------------------------------------------------------


@api.post("/quick-add", response_model=QuickAddResult, status_code=201, tags=["assistant"])
def quick_add(body: QuickAdd, session: Session = Depends(get_session)):
    """Add a task by names instead of ids, e.g.
    `{"title": "milk", "list": "shopping list"}` lands in Personal > Shopping List."""
    workspaces = session.exec(select(Workspace)).all()
    list_name = body.list or DEFAULT_LIST

    if body.workspace:
        ws = best_match(body.workspace, workspaces)
        if not ws:
            names = ", ".join(w.name for w in workspaces)
            raise HTTPException(404, f"No workspace matching '{body.workspace}'. Existing: {names}")
        lst = best_match(list_name, session.exec(select(TaskList).where(TaskList.workspace_id == ws.id)).all())
    else:
        # No workspace given: look for the list everywhere, Personal first.
        ws = best_match(DEFAULT_WORKSPACE, workspaces) or (workspaces[0] if workspaces else None)
        if ws is None:
            raise HTTPException(409, "No workspaces exist yet")
        ordered = sorted(session.exec(select(TaskList)).all(), key=lambda l: l.workspace_id != ws.id)
        lst = best_match(list_name, ordered)
        if lst:
            ws = session.get(Workspace, lst.workspace_id)

    created_list = False
    if lst is None:
        lst = TaskList(workspace_id=ws.id, name=list_name.strip().title(), slug=slugify(list_name))
        session.add(lst)
        session.flush()
        created_list = True

    task = Task(
        list_id=lst.id,
        position=next_position(session, lst.id),
        **body.model_dump(include={"title", "notes", "priority", "due_date"}),
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    msg = f"Added '{task.title}' to {ws.name} > {lst.name}" + (" (new list)" if created_list else "")
    return QuickAddResult(task=task_read(session, task), created_list=created_list, message=msg)


@api.get("/overview", tags=["assistant"])
def overview(include_done: bool = False, session: Session = Depends(get_session)):
    """Every workspace, list and task in one nested payload, handy as assistant context."""
    out = []
    for ws in session.exec(select(Workspace).order_by(Workspace.id)).all():
        lists = []
        for lst in session.exec(select(TaskList).where(TaskList.workspace_id == ws.id).order_by(TaskList.id)).all():
            stmt = select(Task).where(Task.list_id == lst.id)
            if not include_done:
                stmt = stmt.where(Task.status != Status.done)
            tasks = session.exec(stmt.order_by(Task.position)).all()
            lists.append(
                {
                    "id": lst.id,
                    "name": lst.name,
                    "tasks": [
                        t.model_dump(include={"id", "title", "status", "priority", "due_date"}) for t in tasks
                    ],
                }
            )
        out.append({"id": ws.id, "name": ws.name, "lists": lists})
    return out


app.include_router(api)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")

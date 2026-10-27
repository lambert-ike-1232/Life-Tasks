import os

from sqlmodel import Session, SQLModel, create_engine, select

from .models import TaskList, Workspace

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./life_tasks.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

# Created on first run so the board is never empty.
DEFAULT_WORKSPACES = {
    "Personal": ("#4f46e5", ["Shopping List", "To Do"]),
    "Toyota": ("#dc2626", ["To Do"]),
    "Agentic": ("#059669", ["To Do"]),
}


def get_session():
    with Session(engine) as session:
        yield session


def init_db(seed: bool = True) -> None:
    from .resolve import slugify

    SQLModel.metadata.create_all(engine)
    if not seed:
        return
    with Session(engine) as session:
        if session.exec(select(Workspace)).first():
            return
        for name, (color, lists) in DEFAULT_WORKSPACES.items():
            ws = Workspace(name=name, slug=slugify(name), color=color)
            session.add(ws)
            session.flush()
            for list_name in lists:
                session.add(TaskList(workspace_id=ws.id, name=list_name, slug=slugify(list_name)))
        session.commit()

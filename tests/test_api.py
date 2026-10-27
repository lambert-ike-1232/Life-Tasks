import os

import pytest

os.environ["DATABASE_URL"] = "sqlite:///./test_life_tasks.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    SQLModel.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c
    SQLModel.metadata.drop_all(engine)


def ws_id(client, name):
    return next(w["id"] for w in client.get("/api/workspaces").json() if w["name"] == name)


def test_seeds_default_workspaces(client):
    names = [w["name"] for w in client.get("/api/workspaces").json()]
    assert names == ["Personal", "Toyota", "Agentic"]
    lists = [l["name"] for l in client.get(f"/api/workspaces/{ws_id(client, 'Personal')}/lists").json()]
    assert "Shopping List" in lists


def test_quick_add_finds_shopping_list_without_workspace(client):
    r = client.post("/api/quick-add", json={"title": "milk", "list": "shopping"})
    assert r.status_code == 201
    body = r.json()
    assert body["task"]["workspace_name"] == "Personal"
    assert body["task"]["list_name"] == "Shopping List"
    assert body["created_list"] is False
    assert body["message"] == "Added 'milk' to Personal > Shopping List"


def test_quick_add_creates_missing_list(client):
    r = client.post("/api/quick-add", json={"title": "Fix prompt evals", "workspace": "agentic", "list": "research"})
    body = r.json()
    assert body["created_list"] is True
    assert body["task"]["workspace_name"] == "Agentic"
    assert body["task"]["list_name"] == "Research"


def test_quick_add_unknown_workspace(client):
    r = client.post("/api/quick-add", json={"title": "x", "workspace": "nope"})
    assert r.status_code == 404
    assert "Personal" in r.json()["detail"]


def test_task_lifecycle(client):
    pid = ws_id(client, "Personal")
    lst = client.post(f"/api/workspaces/{pid}/lists", json={"name": "Errands"}).json()
    task = client.post(f"/api/lists/{lst['id']}/tasks", json={"title": "Post office", "due_date": "2026-11-01"}).json()
    assert task["status"] == "todo"

    done = client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()
    assert done["status"] == "done" and done["completed_at"]

    assert client.get("/api/tasks", params={"include_done": False, "list_id": lst["id"]}).json() == []
    found = client.get("/api/tasks", params={"q": "post", "due_before": "2026-11-30"}).json()
    assert [t["id"] for t in found] == [task["id"]]

    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_overview_hides_done_by_default(client):
    client.post("/api/quick-add", json={"title": "milk", "list": "shopping"})
    t = client.post("/api/quick-add", json={"title": "eggs", "list": "shopping"}).json()["task"]
    client.patch(f"/api/tasks/{t['id']}", json={"status": "done"})
    personal = client.get("/api/overview").json()[0]
    shopping = next(l for l in personal["lists"] if l["name"] == "Shopping List")
    assert [x["title"] for x in shopping["tasks"]] == ["milk"]


def test_api_key(client, monkeypatch):
    monkeypatch.setenv("LIFE_TASKS_API_KEY", "secret")
    assert client.get("/api/workspaces").status_code == 401
    assert client.get("/api/workspaces", headers={"X-API-Key": "secret"}).status_code == 200


def test_delete_workspace_cascades(client):
    aid = ws_id(client, "Agentic")
    client.post("/api/quick-add", json={"title": "x", "workspace": "agentic"})
    assert client.delete(f"/api/workspaces/{aid}").status_code == 204
    assert all(t["workspace_name"] != "Agentic" for t in client.get("/api/tasks").json())

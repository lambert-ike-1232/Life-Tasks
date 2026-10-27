import base64
import json
import os
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

os.environ["DATABASE_URL"] = "sqlite:///./test_life_tasks.db"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app import gcal  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402


class FakeGoogle:
    """Just enough of Google's OAuth and Calendar APIs, held in memory."""

    def __init__(self):
        self.events = {}
        self.next_id = 0
        self.fail = False
        self.requests = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = request.url
        if url.host == "oauth2.googleapis.com":
            if url.path == "/token":
                payload = base64.urlsafe_b64encode(json.dumps({"email": "lambert@example.com"}).encode()).decode()
                return httpx.Response(200, json={
                    "access_token": "at", "refresh_token": "rt", "expires_in": 3600,
                    "id_token": f"h.{payload.rstrip('=')}.s",
                })
            return httpx.Response(200)
        if self.fail:
            return httpx.Response(503, text="backend error")
        assert request.headers["authorization"] == "Bearer at"
        parts = url.path.split("/events")
        event_id = parts[1].lstrip("/")
        if request.method == "POST":
            self.next_id += 1
            event = {"id": f"ev{self.next_id}", **json.loads(request.content)}
            self.events[event["id"]] = event
            return httpx.Response(200, json=event)
        if event_id not in self.events:
            return httpx.Response(404)
        if request.method == "PATCH":
            self.events[event_id].update(json.loads(request.content))
            return httpx.Response(200, json=self.events[event_id])
        if request.method == "DELETE":
            del self.events[event_id]
            return httpx.Response(204)
        raise AssertionError(f"unexpected {request.method} {url}")


@pytest.fixture()
def google(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "csecret")
    monkeypatch.setattr(gcal, "http", httpx.Client(transport=httpx.MockTransport(fake.handler)))
    return fake


@pytest.fixture()
def client():
    SQLModel.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c
    SQLModel.metadata.drop_all(engine)


def connect(client):
    auth_url = client.get("/api/google/connect").json()["auth_url"]
    q = parse_qs(urlparse(auth_url).query)
    assert q["access_type"] == ["offline"]
    assert q["redirect_uri"] == ["http://testserver/google/callback"]
    r = client.get("/google/callback", params={"code": "c", "state": q["state"][0]}, follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/?google=connected"


def test_status_when_not_configured(client):
    assert client.get("/api/google/status").json() == {
        "configured": False, "connected": False, "email": None, "calendar_id": None,
    }
    assert client.get("/api/google/connect").status_code == 400


def test_tasks_without_connection_are_untouched(client, google):
    t = client.post("/api/quick-add", json={"title": "milk", "due_date": "2026-11-01"}).json()["task"]
    assert t["calendar_event_id"] is None
    assert google.requests == []


def test_connect_backfills_and_tracks_task_changes(client, google):
    early = client.post("/api/quick-add", json={"title": "Dentist", "due_date": "2026-11-05"}).json()["task"]
    client.post("/api/quick-add", json={"title": "no date"})
    connect(client)

    status = client.get("/api/google/status").json()
    assert status["connected"] and status["email"] == "lambert@example.com"
    [event] = google.events.values()
    assert event["summary"] == "Dentist"
    assert event["start"] == {"date": "2026-11-05"} and event["end"] == {"date": "2026-11-06"}
    assert event["description"] == "Personal > To Do · Life Tasks"
    assert client.get(f"/api/tasks/{early['id']}").json()["calendar_event_id"] == event["id"]

    # New task, then move its date and finish it.
    t = client.post("/api/quick-add", json={"title": "Post office", "list": "shopping", "due_date": "2026-11-01"}).json()["task"]
    eid = t["calendar_event_id"]
    assert google.events[eid]["description"] == "Personal > Shopping List · Life Tasks"
    client.patch(f"/api/tasks/{t['id']}", json={"due_date": "2026-11-02", "status": "done"})
    assert google.events[eid]["start"] == {"date": "2026-11-02"}
    assert google.events[eid]["summary"] == "✓ Post office"

    # Clearing the date removes the event.
    t = client.patch(f"/api/tasks/{t['id']}", json={"due_date": None}).json()
    assert t["calendar_event_id"] is None and eid not in google.events

    client.delete(f"/api/tasks/{early['id']}")
    assert google.events == {}


def test_event_deleted_in_google_is_recreated(client, google):
    connect(client)
    t = client.post("/api/quick-add", json={"title": "Gym", "due_date": "2026-11-01"}).json()["task"]
    google.events.clear()
    t = client.patch(f"/api/tasks/{t['id']}", json={"title": "Gym (legs)"}).json()
    assert google.events[t["calendar_event_id"]]["summary"] == "Gym (legs)"


def test_list_rename_updates_events_and_list_delete_removes_them(client, google):
    connect(client)
    t = client.post("/api/quick-add", json={"title": "Gym", "list": "health", "due_date": "2026-11-01"}).json()["task"]
    client.patch(f"/api/lists/{t['list_id']}", json={"name": "Fitness"})
    assert google.events[t["calendar_event_id"]]["description"] == "Personal > Fitness · Life Tasks"
    client.delete(f"/api/lists/{t['list_id']}")
    assert google.events == {}


def test_google_outage_does_not_fail_the_request(client, google):
    connect(client)
    google.fail = True
    r = client.post("/api/quick-add", json={"title": "Gym", "due_date": "2026-11-01"})
    assert r.status_code == 201 and r.json()["task"]["calendar_event_id"] is None

    google.fail = False
    assert client.post("/api/google/sync").json() == {"synced": 1, "failed": 0}
    assert len(google.events) == 1


def test_callback_rejects_bad_state(client, google):
    assert client.get("/google/callback", params={"code": "c", "state": "1.forged"}).status_code == 400
    assert not client.get("/api/google/status").json()["connected"]


def test_disconnect(client, google):
    connect(client)
    assert client.delete("/api/google").status_code == 204
    assert not client.get("/api/google/status").json()["connected"]
    assert client.post("/api/google/sync").status_code == 409

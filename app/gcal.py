"""Google Calendar sync.

Every task with a due date gets an all-day event on that date in the connected
Google Calendar. Editing the task updates the event, finishing it ticks the
event title ("✓ Post office"), and clearing the due date or deleting the task
removes the event. The event id is kept in `Task.calendar_event_id`.

Sync is one way (tasks -> calendar) and best effort: a Google outage never
fails the task request, it is only logged, and `POST /api/google/sync` catches
everything up afterwards.

Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Google Cloud OAuth
client (see docs/google-calendar.md). Only one Google account is connected at
a time until user accounts exist.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import timedelta
from typing import Optional
from urllib.parse import quote, urlencode

import httpx
from sqlmodel import Session, select

from .models import GoogleAccount, Status, Task, TaskList, Workspace

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
SCOPES = "openid email https://www.googleapis.com/auth/calendar.events"
STATE_MAX_AGE = 600  # seconds the user has to finish the Google consent screen

# Module level so tests can swap in a mock transport.
http = httpx.Client(timeout=10)


class GoogleError(Exception):
    pass


def client_id() -> Optional[str]:
    return os.environ.get("GOOGLE_CLIENT_ID")


def client_secret() -> Optional[str]:
    return os.environ.get("GOOGLE_CLIENT_SECRET")


def configured() -> bool:
    return bool(client_id() and client_secret())


def get_account(session: Session) -> Optional[GoogleAccount]:
    return session.exec(select(GoogleAccount)).first()


# --- OAuth -----------------------------------------------------------------


def _sign(value: str) -> str:
    return hmac.new(client_secret().encode(), value.encode(), hashlib.sha256).hexdigest()


def make_state() -> str:
    """Stateless CSRF token for the OAuth round trip: a timestamp signed with
    the client secret, so no server-side storage is needed."""
    ts = str(int(time.time()))
    return f"{ts}.{_sign(ts)}"


def check_state(state: str) -> bool:
    ts, _, sig = state.partition(".")
    if not ts.isdigit() or not hmac.compare_digest(sig, _sign(ts)):
        return False
    return time.time() - int(ts) <= STATE_MAX_AGE


def auth_url(redirect_uri: str) -> str:
    params = {
        "client_id": client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",  # we need a refresh token to sync later
        "prompt": "consent",  # Google only returns the refresh token on consent
        "include_granted_scopes": "true",
        "state": make_state(),
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def _email_from_id_token(id_token: Optional[str]) -> Optional[str]:
    # The token came straight from Google over TLS, so reading the payload
    # without verifying the signature is fine for a display-only email.
    if not id_token:
        return None
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except (IndexError, ValueError):
        return None


def connect(session: Session, code: str, redirect_uri: str) -> GoogleAccount:
    """Exchange the OAuth code for tokens and store them, replacing any
    previously connected account."""
    r = http.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id(),
            "client_secret": client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    if r.status_code != 200:
        raise GoogleError(f"Google rejected the sign-in: {r.text}")
    tok = r.json()
    if "refresh_token" not in tok:
        raise GoogleError("Google did not return a refresh token; remove Life Tasks at "
                          "https://myaccount.google.com/permissions and connect again")

    account = get_account(session) or GoogleAccount(refresh_token="")
    account.email = _email_from_id_token(tok.get("id_token"))
    account.refresh_token = tok["refresh_token"]
    account.access_token = tok["access_token"]
    account.token_expires_at = time.time() + tok.get("expires_in", 3600)
    account.calendar_id = os.environ.get("GOOGLE_CALENDAR_ID", "primary")
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


def disconnect(session: Session) -> None:
    account = get_account(session)
    if not account:
        return
    try:
        http.post(REVOKE_URL, data={"token": account.refresh_token})
    except httpx.HTTPError:
        log.warning("Could not revoke Google token; removing it locally anyway")
    session.delete(account)
    session.commit()


def _access_token(session: Session, account: GoogleAccount) -> str:
    if account.access_token and account.token_expires_at > time.time() + 60:
        return account.access_token
    r = http.post(
        TOKEN_URL,
        data={
            "client_id": client_id(),
            "client_secret": client_secret(),
            "refresh_token": account.refresh_token,
            "grant_type": "refresh_token",
        },
    )
    if r.status_code != 200:
        raise GoogleError(f"Could not refresh Google token ({r.status_code}): {r.text}")
    tok = r.json()
    account.access_token = tok["access_token"]
    account.token_expires_at = time.time() + tok.get("expires_in", 3600)
    session.add(account)
    return account.access_token


def _call(session: Session, account: GoogleAccount, method: str, path: str, **kw) -> httpx.Response:
    headers = {"Authorization": f"Bearer {_access_token(session, account)}"}
    return http.request(method, f"{CALENDAR_API}{path}", headers=headers, **kw)


# --- sync ------------------------------------------------------------------


def event_body(session: Session, task: Task) -> dict:
    lst = session.get(TaskList, task.list_id)
    ws = session.get(Workspace, lst.workspace_id)
    where = f"{ws.name} > {lst.name} · Life Tasks"
    return {
        "summary": ("✓ " if task.status == Status.done else "") + task.title,
        "description": f"{task.notes}\n\n{where}" if task.notes else where,
        "start": {"date": task.due_date.isoformat()},
        "end": {"date": (task.due_date + timedelta(days=1)).isoformat()},
        "transparency": "transparent",  # a task shouldn't show you as busy
        "extendedProperties": {"private": {"lifeTasksId": str(task.id)}},
    }


def _events_path(account: GoogleAccount, event_id: str = "") -> str:
    path = f"/calendars/{quote(account.calendar_id, safe='')}/events"
    return f"{path}/{quote(event_id, safe='')}" if event_id else path


def _push(session: Session, account: GoogleAccount, task: Task) -> None:
    if task.due_date is None:
        if task.calendar_event_id:
            _delete_event(session, account, task.calendar_event_id)
            task.calendar_event_id = None
        return

    body = event_body(session, task)
    if task.calendar_event_id:
        r = _call(session, account, "PATCH", _events_path(account, task.calendar_event_id), json=body)
        # Deleted in Google (or a different account is connected now): recreate it.
        if r.status_code not in (404, 410) and not _cancelled(r):
            _raise_for(r)
            return
    r = _call(session, account, "POST", _events_path(account), json=body)
    _raise_for(r)
    task.calendar_event_id = r.json()["id"]


def _cancelled(r: httpx.Response) -> bool:
    # PATCHing an event the user deleted can succeed and return it as cancelled.
    return r.status_code == 200 and r.json().get("status") == "cancelled"


def _delete_event(session: Session, account: GoogleAccount, event_id: str) -> None:
    r = _call(session, account, "DELETE", _events_path(account, event_id))
    if r.status_code not in (204, 404, 410):
        _raise_for(r)


def _raise_for(r: httpx.Response) -> None:
    if r.status_code >= 400:
        raise GoogleError(f"Google Calendar returned {r.status_code}: {r.text}")


def sync_task(session: Session, task: Task) -> bool:
    """Bring the task's calendar event in line with the task, then commit.
    Returns False (and logs) on failure instead of raising."""
    account = get_account(session)
    if not account or not configured():
        return False
    try:
        _push(session, account, task)
    except (GoogleError, httpx.HTTPError) as e:
        log.warning("Calendar sync failed for task %s: %s", task.id, e)
        session.commit()  # keep a refreshed access token
        return False
    session.add(task)
    session.commit()
    return True


def remove_task(session: Session, task: Task) -> None:
    """Delete the task's event before the task itself is deleted. Does not commit."""
    account = get_account(session)
    if not task.calendar_event_id or not account or not configured():
        return
    try:
        _delete_event(session, account, task.calendar_event_id)
    except (GoogleError, httpx.HTTPError) as e:
        log.warning("Could not delete calendar event for task %s: %s", task.id, e)


def sync_all(session: Session) -> dict:
    """Push every task that has, or used to have, a calendar event."""
    tasks = session.exec(
        select(Task).where(Task.due_date.is_not(None) | Task.calendar_event_id.is_not(None))
    ).all()
    results = [sync_task(session, t) for t in tasks]
    return {"synced": results.count(True), "failed": results.count(False)}

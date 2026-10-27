# Life Tasks

A Jira-style board for your whole life. **Workspaces** (Personal, Toyota, Agentic) hold **lists** (Shopping List, To Do, ...), and lists hold **tasks** that move across To do / In progress / Done.

It's built to be driven by an AI assistant as well as by hand: "add milk to the shopping list" is one API call.

## Run it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- Board: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs (OpenAPI schema at `/openapi.json`)

Data lives in `life_tasks.db` (SQLite). Set `DATABASE_URL` to use another database, e.g. Postgres when hosted.
On first run it creates Personal (Shopping List, To Do), Toyota (To Do) and Agentic (To Do).

## For the assistant

**Quick add, by name.** Names are matched loosely (`"shopping"` finds "Shopping List"). If no workspace is given, the list is searched for across workspaces with Personal first. A list that doesn't exist yet is created.

```bash
curl -X POST localhost:8000/api/quick-add -H 'Content-Type: application/json' \
  -d '{"title": "milk", "list": "shopping list"}'
# -> {"message": "Added 'milk' to Personal > Shopping List", "task": {...}, "created_list": false}

curl -X POST localhost:8000/api/quick-add -H 'Content-Type: application/json' \
  -d '{"title": "Draft Q4 deck", "workspace": "toyota", "priority": "high", "due_date": "2026-11-03"}'
```

**Everything at a glance.** `GET /api/overview` returns every workspace, list and open task in one nested payload, handy as context for the assistant.

**Search.** `GET /api/tasks?q=milk&workspace_id=1&status=todo&due_before=2026-11-01&include_done=false`

**Full CRUD.**

| Resource | Endpoints |
|---|---|
| Workspaces | `GET/POST /api/workspaces`, `PATCH/DELETE /api/workspaces/{id}` |
| Lists | `GET/POST /api/workspaces/{id}/lists`, `PATCH/DELETE /api/lists/{id}` |
| Tasks | `POST /api/lists/{id}/tasks`, `GET/PATCH/DELETE /api/tasks/{id}` |

Mark a task done with `PATCH /api/tasks/{id}` and `{"status": "done"}`; move it with `{"list_id": ...}`.

**Auth.** Set `LIFE_TASKS_API_KEY` and every `/api` call must send it in an `X-API-Key` header (the web UI asks for it once). This is a stand-in until real accounts exist.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Roadmap

- User accounts (`Workspace.owner_id` is already in the schema)
- Google Calendar sync for tasks with due dates (`Task.calendar_event_id` is reserved for it)
- Hosting (Render / Fly.io with Postgres) so the assistant and phone can reach it
- MCP server wrapper so Claude-based assistants get the tools natively

# Google Calendar setup

Life Tasks puts every task that has a due date into your Google Calendar as an all-day event. Changing the task updates the event, finishing it ticks the title ("✓ Dentist"), and clearing the date or deleting the task removes the event. Sync goes one way: edits made in Google Calendar are not copied back to the board.

You need a Google Cloud OAuth client once. It's free and takes about ten minutes.

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com/projectcreate, name it "Life Tasks", and create it.
2. Make sure the new project is selected in the top bar for the remaining steps.

## 2. Turn on the Calendar API

Open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com and click **Enable**.

## 3. Set up the consent screen

1. Open https://console.cloud.google.com/auth/branding (Google Auth Platform). Click **Get started** if asked.
2. App name "Life Tasks", your Gmail as support and contact email. Audience: **External**.
3. Under **Audience**, add your own Gmail address as a **Test user**. While the app stays in "Testing" mode only test users can sign in, which is what you want for a personal app.
4. Under **Data access**, add the scope `.../auth/calendar.events` (optional; the app asks for it either way).

Note: in Testing mode Google expires the sign-in after 7 days, so you'd click **Connect** again weekly. To avoid that, go to **Audience** and click **Publish app**. For a personal app Google doesn't require verification; you'll just see an "unverified app" warning you can click through.

## 4. Create the OAuth client

1. Open https://console.cloud.google.com/auth/clients and click **Create client**.
2. Application type: **Web application**, name "Life Tasks".
3. Under **Authorized redirect URIs** add `http://localhost:8000/google/callback`. When the app is hosted, add the hosted address too, e.g. `https://life-tasks.example.com/google/callback`.
4. Create it and copy the **Client ID** and **Client secret**.

## 5. Give them to the app

```bash
export GOOGLE_CLIENT_ID="1234-abc.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-..."
uvicorn app.main:app --reload
```

Optional settings:

| Variable | Default | What it does |
|---|---|---|
| `GOOGLE_CALENDAR_ID` | `primary` | Which calendar gets the events. To keep tasks in their own calendar, create one in Google Calendar, then copy its ID from Settings > *calendar* > Integrate calendar. Read when you connect. |
| `GOOGLE_REDIRECT_URI` | worked out from the request | Set it when hosting behind a proxy, so it matches the redirect URI from step 4 exactly. |

Keep the secret out of git. On a host, put both values in its environment settings.

## 6. Connect

Open the board, find **Google Calendar** at the bottom of the sidebar and click **Connect**. Sign in with the test user from step 3 and allow access. You'll land back on the board, and every task with a due date is copied to your calendar straight away. Synced tasks show 📅 on their card.

**Sync now** re-sends everything (useful if Google was unreachable when you edited a task). **Disconnect** stops syncing and revokes access; events already created stay in the calendar.

## API

| Endpoint | |
|---|---|
| `GET /api/google/status` | Is it configured and connected, and to which account |
| `GET /api/google/connect` | Returns `auth_url` to open in a browser |
| `POST /api/google/sync` | Push every dated task again, returns `{"synced": n, "failed": n}` |
| `DELETE /api/google` | Disconnect |

## Troubleshooting

- **"redirect_uri_mismatch"**: the address in step 4 must match exactly, including `http` vs `https` and the port.
- **"Access blocked: app has not completed verification"**: add your Gmail as a test user (step 3).
- **Events stopped appearing after a week**: the app is still in Testing mode; click **Connect** again, or publish the app (step 3).
- **A task didn't sync**: the server log has a `Calendar sync failed` line with Google's reason. Fix it, then click **Sync now**.

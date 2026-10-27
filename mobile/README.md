# Life Tasks for iPhone

An Expo (React Native) app for the Life Tasks backend. It talks to the same REST API as the web board, so anything added from the phone, the web board or the assistant shows up everywhere.

## What it does

- **Lists**: every workspace with its lists and open-task counts. "+ List" creates a list.
- **Upcoming**: everything due in the next 14 days, grouped into Overdue, Today, Tomorrow, This week and Later.
- **Quick add** (top of the home screen), using the backend's `/api/quick-add`:

  | Type | Means |
  |---|---|
  | `milk #shopping` | add to the list matching "shopping" |
  | `Draft Q4 deck @toyota` | add to the Toyota workspace |
  | `pay rent !` or `!high` / `!low` | priority |
  | `call mom ^tomorrow`, `^fri`, `^2026-11-03` | due date |

  Multi-word list names use dashes: `#shopping-list`.
- **A list**: To do / In progress / Done tabs, tap the circle to complete, add tasks at the bottom (the `!` and `^` shortcuts work here too). "Edit" renames or deletes the list.
- **A task**: edit title, notes, status, priority and due date, move it to another list, or delete it.
- **Settings**: server address and optional API key, stored in the iOS Keychain.

Light and dark mode follow the phone.

## Try it on your iPhone (no Mac needed)

1. Install **Expo Go** from the App Store.
2. Start the backend so the phone can reach it. On the same Wi-Fi:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   and find your computer's local IP (e.g. `192.168.1.20`).
3. Start the app:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
4. Scan the QR code with the iPhone camera. It opens in Expo Go.
5. On the Connect screen enter `192.168.1.20:8000` (plus the API key if you set `LIFE_TASKS_API_KEY`).

To skip step 5 you can bake in a default: put `EXPO_PUBLIC_LIFE_TASKS_URL=https://your-server` in `mobile/.env.local` (git-ignored).

## Using it away from home

The phone needs to reach the backend, so for everyday use the backend has to be hosted somewhere public over HTTPS (Render or Fly.io with Postgres, see the main README's roadmap). Set `LIFE_TASKS_API_KEY` on the server once it is public, then point the app's Settings at the hosted URL.

## Installing it as a real app

Expo Go is for development. To get a home-screen app without Expo Go, build with EAS (runs in Expo's cloud, no Mac needed, requires an Apple Developer account at $99/year):

```bash
npx eas-cli@latest build --platform ios --profile preview   # installable on registered devices
npx eas-cli@latest submit --platform ios                    # TestFlight / App Store
```

The bundle identifier is `com.lambert.lifetasks` in `app.json`; change it before the first build if you prefer another.

## Development

```bash
npm run typecheck   # tsc
npm test            # quick-add parser and date helpers (node --test)
```

Code layout: screens live in `src/app/` (Expo Router, one file per screen), the API client and helpers in `src/lib/`, shared UI in `src/components/`. `src/lib/types.ts` mirrors `app/schemas.py` in the backend.

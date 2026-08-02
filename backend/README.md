# Flashcards Backend (Node.js + TypeScript)

This is the first migration step from `server.py` to a modular Node.js backend.

## Scope in this phase

- TypeScript backend project under `backend/`
- SQLite-backed `/api` routes compatible with the current frontend
- Static serving of a web root (`FLASHCARDS_WEB_ROOT`), defaulting to:
  - `frontend/dist` when present
  - otherwise the legacy app root (`index.html`, `js/`, `styles/`, `icons/`, etc.)

## API compatibility

Implemented routes:

- `GET /api/health`
- `GET /api/stats`
- `GET /api/:store`
- `GET /api/:store/:key`
- `PUT /api/:store`
- `DELETE /api/:store/:key`

Stores:

- `subjects`
- `topics`
- `cards`
- `progress`
- `settings`
- `cardbank`

Query features ported:

- `topics`: `?subjectId=...&includeCounts=1`
- `cards`: `?cardId=...` and/or `?topicId=...` and `?fields=a,b,c`
- `progress`: `?cardId=...`

## Run locally

1. Install dependencies:
   - `cd backend`
   - `npm install`
2. Start in dev mode:
   - `npm run dev`
3. Open:
   - `http://127.0.0.1:8000`

## Live Preview (Auto-Reload)

Use this while working on backend + frontend TS + Tailwind in parallel:

1. `cd backend`
2. `npm run dev:live`
3. Open: `http://127.0.0.1:3000`

What it does:

- starts backend in watch mode
- rebuilds `frontend-ts` panel bundle on change
- rebuilds Tailwind CSS on change
- reloads browser automatically when `index.html`, `js/**`, `styles/**`, or `icons/**` change

## New Frontend (Vite + React + TS)

Use this for the migration from legacy UI to component-based React UI.

1. Install frontend dependencies:
   - `cd ../frontend`
   - `npm install`
2. Run backend + Vite dev server in parallel:
   - `cd ../backend`
   - `npm run dev:vite`
3. Open:
   - `http://127.0.0.1:5173`

Notes:
- Vite proxies `/api/*` to the backend on `127.0.0.1:8000` by default.
- For production serving through Node backend:
  - `cd ../frontend && npm run build`
  - backend will auto-pick `frontend/dist` as web root (or set `FLASHCARDS_WEB_ROOT`).

## Enable frontend HTTP backend mode

To make the existing frontend use this Node backend instead of Supabase calls:

1. Open [index.html](/Users/simonbader/coding_local/flashcards/index.html).
2. In the config `<script>` block, set:
   - `window.__BACKEND_MODE__ = 'http';`
3. Keep local snapshot mode disabled:
   - `window.__LOCAL_SNAPSHOT_MODE__ = false;`

Then reload the app served by the Node backend URL.

## Build + start

- `npm run build`
- `npm run start`

## Environment

See `.env.example` for available variables:

- `HOST` (default: `0.0.0.0`)
- `PORT` (default: `8000`)
- `FLASHCARDS_APP_ROOT` (optional)
- `FLASHCARDS_WEB_ROOT` (optional)
- `FLASHCARDS_DB_PATH` (optional)

## Architecture

- `src/config`: runtime config
- `src/db`: SQLite setup/init
- `src/repositories`: data access
- `src/routes`: API + static routes
- `src/types`: shared store contracts

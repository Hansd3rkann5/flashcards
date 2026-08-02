# Flashcards Frontend (Vite + React + TypeScript)

This is the new frontend migration target.

## Run (development)

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Start the frontend dev server:

```bash
npm run dev
```

Default URL: `http://127.0.0.1:5173`

## API wiring

- In development, Vite proxies `/api/*` to `http://127.0.0.1:8000`.
- Override proxy target with env variable:
  - `VITE_API_PROXY_TARGET=http://127.0.0.1:8010`

If you want absolute API URLs in browser (without proxy), set:

- `VITE_API_BASE_URL=http://127.0.0.1:8000`

## Build

```bash
npm run build
```

Output directory: `frontend/dist`

# Flashcards

Flashcard web app for engineering students using Supabase.

## Local Backend Options

1. Legacy local server (Python): `python3 server.py`
2. New modular backend (Node + TypeScript): see [backend/README.md](backend/README.md)

When using the Node backend, set `window.__BACKEND_MODE__ = 'http'` in `index.html` so frontend API calls go to `/api/*` instead of Supabase SDK paths.

## Frontend Migration Paths

### Recommended: Vite + React + TypeScript (`frontend/`)

New UI migration target:

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://127.0.0.1:5173` and proxies `/api/*` to backend.

To run backend + Vite together:

```bash
cd backend
npm install
npm run dev:vite
```

### Legacy TS Runtime Layer (`frontend-ts/`)

The project now contains a frontend TS source layer under `frontend-ts/` with an app-oriented structure:

- `app/`
- `components/`
- `features/`
- `lib/`
- `types/`

Compile frontend TS panel components to browser runtime scripts:

```bash
cd backend
npm run build:frontend-panels
```

Build Tailwind-generated UI styles (buttons, panel, header) from `frontend-ts/app/tailwind.css`:

```bash
cd backend
npm run build:frontend-tailwind
```

Run both frontend build steps:

```bash
cd backend
npm run build:frontend-ui
```

**Quick Start**

1. Host the static files (`index.html`, `styles.css`, `js/`, `icons/`, `sw.js`) on HTTPS (e.g. GitHub Pages).
2. Open the hosted URL in browser.
3. Set Supabase config in `index.html`:
   ```html
   <script>
     window.__SUPABASE_URL__ = 'https://YOUR_PROJECT_ID.supabase.co';
     window.__SUPABASE_ANON_KEY__ = 'YOUR_SUPABASE_ANON_KEY';
   </script>
   ```
4. Create table `records` in Supabase SQL editor:
   ```sql
   create table if not exists public.records (
     store text not null,
     record_key text not null,
     payload jsonb not null,
     updated_at timestamptz not null default now(),
     primary key (store, record_key)
   );
   create index if not exists records_store_updated_idx on public.records (store, updated_at);
   ```
5. Enable RLS + policies for browser access (no login flow):
   ```sql
   alter table public.records enable row level security;

   create policy "records_select_anon" on public.records
     for select to anon using (true);

   create policy "records_insert_anon" on public.records
     for insert to anon with check (true);

   create policy "records_update_anon" on public.records
     for update to anon using (true) with check (true);

   create policy "records_delete_anon" on public.records
     for delete to anon using (true);
   ```
6. Open the hosted URL in browser.

**One-Time Migration (SQLite -> Supabase)**

```bash
python3 scripts/migrate_sqlite_to_supabase.py \
  --url https://ioizksaimszcsqkwqkhn.supabase.co \
  --key YOUR_SUPABASE_KEY
```

Use `--dry-run` first to validate row counts without uploading.
If your local Python TLS trust store is broken, add `--insecure` for migration only.

**How To Use**

1. **Create Subjects and Topics**
   - Use the left sidebar to add a Subject (accent color sets the subject theme).
   - Click a Subject to drill into Topics, then add a Topic.

2. **Add Cards**
   - In a Topic, add cards as either:
     - **Q&A** (front/back)
     - **Multi-select MCQ** (prefix correct options with `*`)
   - Optionally attach an image (stored in the card record payload as base64).

3. **Study Session**
   - Start a session from the Topic view.
   - Session size is up to 15 randomized cards.
   - Grade cards via:
     - **Buttons:** Red (wrong), Yellow (partial), Green (correct)
     - **Swipes:** Right = Red, Down = Yellow, Left = Green
   - A card is mastered after **3 consecutive correct** answers.
   - Wrong answers move the card **4 positions back** in the queue.

4. **Formatting**
   - Markdown-style emphasis: `**bold**`, `*italic*`
   - Inline color: `[text]{#ff6b6b}`
   - LaTeX: wrap in `$...$` or `$$...$$` (rendered with KaTeX)

5. **Export / Import**
   - **Export JSON** for full backup of subjects, topics, cards, and progress.
   - **Export CSV** for cards only.
- **Import JSON** to restore data into the shared database.

**Notes**

- Data is stored in Supabase table `records` (JSON payload per key).
- Card images are stored inside card payloads (base64). Keep image size small.
- The app keeps a local offline cache of loaded data and queues writes while network is unavailable.
- Full app-shell offline loading via Service Worker works in secure contexts (`https://` or `http://localhost`).

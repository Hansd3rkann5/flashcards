#!/usr/bin/env python3
"""One-time migration: local SQLite `records` -> Supabase `records` table.

Usage:
  python3 scripts/migrate_sqlite_to_supabase.py \
    --url https://YOUR_PROJECT.supabase.co \
    --key YOUR_ANON_OR_SERVICE_KEY
"""

from __future__ import annotations

import argparse
import json
import ssl
import sqlite3
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / 'flashcards.sqlite3'
DEFAULT_TABLE = 'records'


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description='Migrate local SQLite records to Supabase.')
  parser.add_argument('--db', default=str(DEFAULT_DB_PATH), help='Path to local SQLite database.')
  parser.add_argument('--url', required=True, help='Supabase project URL, e.g. https://xyz.supabase.co')
  parser.add_argument('--key', required=True, help='Supabase API key (anon or service role).')
  parser.add_argument('--table', default=DEFAULT_TABLE, help='Target table name in Supabase (default: records).')
  parser.add_argument('--batch-size', type=int, default=100, help='Rows per upsert batch (default: 100).')
  parser.add_argument('--stores', nargs='*', default=None, help='Optional store filter, e.g. subjects topics cards progress cardbank')
  parser.add_argument('--insecure', action='store_true', help='Disable TLS certificate validation (use only if your local Python SSL trust store is broken).')
  parser.add_argument('--dry-run', action='store_true', help='Print what would be uploaded, without sending requests.')
  return parser.parse_args()


def to_iso_timestamp(value: object) -> str:
  """Convert SQLite millisecond timestamp to ISO-8601 UTC timestamp."""
  try:
    millis = int(value)
    return datetime.fromtimestamp(millis / 1000.0, tz=timezone.utc).isoformat()
  except Exception:
    return datetime.now(tz=timezone.utc).isoformat()


def load_local_rows(db_path: Path, stores: list[str] | None = None) -> list[dict]:
  """Read rows from local SQLite `records` and normalize payload JSON."""
  if not db_path.exists():
    raise FileNotFoundError(f'Database not found: {db_path}')

  query = 'SELECT store, record_key, payload, updated_at FROM records'
  params: list[str] = []
  if stores:
    placeholders = ','.join('?' for _ in stores)
    query += f' WHERE store IN ({placeholders})'
    params.extend(stores)
  query += ' ORDER BY store, updated_at, record_key'

  with sqlite3.connect(str(db_path)) as conn:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(query, params).fetchall()

  out: list[dict] = []
  for row in rows:
    payload_raw = row['payload']
    try:
      payload = json.loads(payload_raw)
    except Exception as exc:
      raise ValueError(f"Invalid JSON payload for {row['store']}/{row['record_key']}: {exc}") from exc

    out.append({
      'store': str(row['store']),
      'record_key': str(row['record_key']),
      'payload': payload,
      'updated_at': to_iso_timestamp(row['updated_at'])
    })

  return out


def chunked(rows: list[dict], size: int):
  """Yield chunks with fixed maximum size."""
  for idx in range(0, len(rows), size):
    yield rows[idx:idx + size]


def upsert_batch(url: str, key: str, table: str, batch: list[dict], insecure: bool = False) -> None:
  """Upsert one batch into Supabase REST endpoint."""
  safe_url = url.rstrip('/')
  endpoint = f'{safe_url}/rest/v1/{table}?on_conflict=store,record_key'
  data = json.dumps(batch, separators=(',', ':')).encode('utf-8')

  req = urllib.request.Request(endpoint, method='POST', data=data)
  req.add_header('apikey', key)
  req.add_header('Authorization', f'Bearer {key}')
  req.add_header('Content-Type', 'application/json')
  req.add_header('Prefer', 'resolution=merge-duplicates,return=minimal')

  ssl_context = ssl._create_unverified_context() if insecure else None
  with urllib.request.urlopen(req, timeout=30, context=ssl_context) as resp:
    if resp.status < 200 or resp.status >= 300:
      body = resp.read().decode('utf-8', errors='replace')
      raise RuntimeError(f'Supabase error {resp.status}: {body}')


def main() -> int:
  args = parse_args()
  db_path = Path(args.db).expanduser().resolve()

  rows = load_local_rows(db_path, args.stores)
  counts = Counter(row['store'] for row in rows)
  print(f'Loaded {len(rows)} rows from {db_path}')
  for store in sorted(counts):
    print(f'  - {store}: {counts[store]}')

  if not rows:
    print('Nothing to migrate.')
    return 0

  if args.dry_run:
    print('Dry-run enabled: no data sent to Supabase.')
    return 0

  uploaded = 0
  try:
    for batch in chunked(rows, max(1, int(args.batch_size))):
      upsert_batch(args.url, args.key, args.table, batch, insecure=args.insecure)
      uploaded += len(batch)
      print(f'Uploaded {uploaded}/{len(rows)}')
  except urllib.error.HTTPError as exc:
    body = exc.read().decode('utf-8', errors='replace')
    print(f'HTTP error {exc.code}: {body}', file=sys.stderr)
    return 1
  except urllib.error.URLError as exc:
    print(f'Network error: {exc}', file=sys.stderr)
    return 1
  except Exception as exc:
    print(f'Migration failed: {exc}', file=sys.stderr)
    return 1

  print('Migration completed successfully.')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())

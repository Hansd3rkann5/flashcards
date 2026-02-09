#!/usr/bin/env python3
"""Local LAN server for the flashcards app.

- Serves static files from the project directory
- Exposes a small JSON API backed by SQLite
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "flashcards.sqlite3"

KEY_FIELDS = {
    "subjects": "id",
    "topics": "id",
    "cards": "id",
    "progress": "cardId",
    "cardbank": "id",
}


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                store TEXT NOT NULL,
                record_key TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (store, record_key)
            )
            """
        )
        conn.commit()


def api_parts(path: str) -> list[str] | None:
    clean_path = urlparse(path).path
    parts = [p for p in clean_path.split("/") if p]
    if not parts or parts[0] != "api":
        return None
    return parts[1:]


def list_records(store: str) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT payload FROM records WHERE store = ? ORDER BY updated_at ASC",
            (store,),
        ).fetchall()
    items: list[dict] = []
    for (payload,) in rows:
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            items.append(parsed)
    return items


def upsert_record(store: str, record: dict) -> dict:
    key_field = KEY_FIELDS[store]
    key = record.get(key_field)
    if key is None or str(key).strip() == "":
        raise ValueError(f'Missing key field "{key_field}" for store "{store}"')

    payload = json.dumps(record, separators=(",", ":"), ensure_ascii=False)
    updated_at = int(time.time() * 1000)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO records (store, record_key, payload, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(store, record_key)
            DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
            """,
            (store, str(key), payload, updated_at),
        )
        conn.commit()

    return record


def delete_record(store: str, key: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "DELETE FROM records WHERE store = ? AND record_key = ?",
            (store, key),
        )
        conn.commit()


class FlashcardsHandler(SimpleHTTPRequestHandler):
    server_version = "FlashcardsServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def _send_json(self, status: int, payload: dict | list) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_no_content(self) -> None:
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _read_json_body(self) -> dict:
        raw_len = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_len)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length header") from exc

        raw = self.rfile.read(length) if length > 0 else b"{}"
        if not raw:
            return {}

        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Body must be valid JSON") from exc

        if not isinstance(body, dict):
            raise ValueError("JSON body must be an object")
        return body

    def do_OPTIONS(self) -> None:
        parts = api_parts(self.path)
        if parts is None:
            self.send_response(404)
            self.end_headers()
            return
        self._send_no_content()

    def do_GET(self) -> None:
        parts = api_parts(self.path)
        if parts is None:
            return super().do_GET()

        if parts == ["health"]:
            return self._send_json(200, {"ok": True})

        if len(parts) != 1:
            return self._send_json(404, {"error": "Not found"})

        store = parts[0]
        if store not in KEY_FIELDS:
            return self._send_json(404, {"error": f"Unknown store: {store}"})

        return self._send_json(200, list_records(store))

    def do_PUT(self) -> None:
        parts = api_parts(self.path)
        if parts is None:
            return self._send_json(404, {"error": "Not found"})

        if len(parts) != 1:
            return self._send_json(404, {"error": "Not found"})

        store = parts[0]
        if store not in KEY_FIELDS:
            return self._send_json(404, {"error": f"Unknown store: {store}"})

        try:
            body = self._read_json_body()
            record = upsert_record(store, body)
        except ValueError as err:
            return self._send_json(400, {"error": str(err)})

        return self._send_json(200, record)

    def do_DELETE(self) -> None:
        parts = api_parts(self.path)
        if parts is None:
            return self._send_json(404, {"error": "Not found"})

        if len(parts) != 2:
            return self._send_json(404, {"error": "Not found"})

        store = parts[0]
        if store not in KEY_FIELDS:
            return self._send_json(404, {"error": f"Unknown store: {store}"})

        key = unquote(parts[1])
        delete_record(store, key)
        return self._send_no_content()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve flashcards app with shared SQLite backend")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()

    server = ThreadingHTTPServer((args.host, args.port), FlashcardsHandler)
    url_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    print(f"Flashcards server running on http://{url_host}:{args.port}")
    print(f"Database file: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()

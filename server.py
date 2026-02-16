#!/usr/bin/env python3
"""Local LAN server for the flashcards app.

- Serves static files from the project directory
- Exposes a small JSON API backed by SQLite
"""

from __future__ import annotations

import argparse
import gzip
import json
import sqlite3
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "flashcards.sqlite3"

KEY_FIELDS = {
    "subjects": "id",
    "topics": "id",
    "cards": "id",
    "progress": "cardId",
    "cardbank": "id",
}

BENIGN_NETWORK_ERRORS = (
    ConnectionResetError,
    ConnectionAbortedError,
    BrokenPipeError,
    TimeoutError,
)


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


def get_record(store: str, key: str) -> dict | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT payload FROM records WHERE store = ? AND record_key = ? LIMIT 1",
            (store, key),
        ).fetchone()
    if not row:
        return None
    payload = row[0]
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def list_records_by_json_field(store: str, field: str, values: list[str]) -> list[dict]:
    cleaned_values = [str(v).strip() for v in values if str(v).strip()]
    if not cleaned_values:
        return []
    unique_values = list(dict.fromkeys(cleaned_values))
    placeholders = ",".join("?" for _ in unique_values)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            rows = conn.execute(
                f"""
                SELECT payload
                FROM records
                WHERE store = ?
                  AND json_extract(payload, '$.{field}') IN ({placeholders})
                ORDER BY updated_at ASC
                """,
                (store, *unique_values),
            ).fetchall()
    except sqlite3.OperationalError:
        value_set = {str(v) for v in unique_values}
        return [item for item in list_records(store) if str(item.get(field, "")) in value_set]

    items: list[dict] = []
    for (payload,) in rows:
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            items.append(parsed)
    return items


def count_records_by_store(stores: list[str]) -> dict[str, int]:
    wanted = [str(s).strip() for s in stores if str(s).strip()]
    if not wanted:
        return {}
    placeholders = ",".join("?" for _ in wanted)
    counts = {store: 0 for store in wanted}
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            f"""
            SELECT store, COUNT(*)
            FROM records
            WHERE store IN ({placeholders})
            GROUP BY store
            """,
            tuple(wanted),
        ).fetchall()
    for store, count in rows:
        counts[str(store)] = int(count)
    return counts


def count_cards_by_topic_ids(topic_ids: list[str]) -> dict[str, int]:
    cleaned_topic_ids = [str(v).strip() for v in topic_ids if str(v).strip()]
    if not cleaned_topic_ids:
        return {}
    unique_topic_ids = list(dict.fromkeys(cleaned_topic_ids))
    placeholders = ",".join("?" for _ in unique_topic_ids)
    try:
        with sqlite3.connect(DB_PATH) as conn:
            rows = conn.execute(
                f"""
                SELECT json_extract(payload, '$.topicId') AS topic_id, COUNT(*)
                FROM records
                WHERE store = 'cards'
                  AND json_extract(payload, '$.topicId') IN ({placeholders})
                GROUP BY topic_id
                """,
                tuple(unique_topic_ids),
            ).fetchall()
        counts = {str(topic_id): int(count) for topic_id, count in rows if topic_id is not None}
        for topic_id in unique_topic_ids:
            counts.setdefault(topic_id, 0)
        return counts
    except sqlite3.OperationalError:
        counts = {topic_id: 0 for topic_id in unique_topic_ids}
        topic_id_set = set(unique_topic_ids)
        for card in list_records("cards"):
            topic_id = str(card.get("topicId", "")).strip()
            if topic_id in topic_id_set:
                counts[topic_id] += 1
        return counts


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
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def handle(self) -> None:
        try:
            super().handle()
        except BENIGN_NETWORK_ERRORS:
            # Clients (especially mobile Safari) may close keep-alive sockets abruptly.
            # Treat this as a normal disconnect and avoid noisy tracebacks.
            return

    def _trace_enabled(self) -> bool:
        return bool(getattr(self.server, "trace_requests", False))

    def _trace_ip_matches(self) -> bool:
        filter_ip = str(getattr(self.server, "trace_ip", "") or "").strip()
        if not filter_ip:
            return True
        client_ip = self.client_address[0] if self.client_address else ""
        return client_ip == filter_ip

    def _trace_slow_ms(self) -> float:
        try:
            return float(getattr(self.server, "trace_slow_ms", 0.0) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def _trace_log(
        self,
        *,
        method: str,
        path: str,
        status: int,
        total_ms: float,
        db_ms: float = 0.0,
        json_ms: float = 0.0,
        gzip_ms: float = 0.0,
        raw_bytes: int = 0,
        out_bytes: int = 0,
        gzipped: bool = False,
        extra: str = "",
    ) -> None:
        if not self._trace_enabled() or not self._trace_ip_matches():
            return
        slow_threshold = self._trace_slow_ms()
        if slow_threshold > 0 and total_ms < slow_threshold:
            return

        display_path = urlparse(path).path or path
        ua = self.headers.get("User-Agent", "")
        client_ip = self.client_address[0] if self.client_address else "-"
        hint = ""
        if raw_bytes >= 1_000_000:
            hint = "large-payload"
        elif db_ms > 0 and db_ms >= total_ms * 0.6:
            hint = "db-bound"
        elif gzip_ms > 0 and gzip_ms >= total_ms * 0.3:
            hint = "gzip-bound"
        elif out_bytes >= 512_000:
            hint = "network-heavy"

        extra_parts = []
        if hint:
            extra_parts.append(f"hint={hint}")
        if extra:
            extra_parts.append(extra)
        extra_text = f" {' '.join(extra_parts)}" if extra_parts else ""

        print(
            "[TRACE] "
            f"ip={client_ip} "
            f"method={method} "
            f"path={display_path} "
            f"status={status} "
            f"total_ms={total_ms:.1f} "
            f"db_ms={db_ms:.1f} "
            f"json_ms={json_ms:.1f} "
            f"gzip_ms={gzip_ms:.1f} "
            f"raw_kb={raw_bytes / 1024:.1f} "
            f"out_kb={out_bytes / 1024:.1f} "
            f"gzip={1 if gzipped else 0} "
            f'ua="{ua}"'
            f"{extra_text}"
        )

    def _maybe_gzip(self, body: bytes) -> tuple[bytes, bool, float]:
        accept_encoding = self.headers.get("Accept-Encoding", "").lower()
        t0 = time.perf_counter()
        if "gzip" not in accept_encoding:
            return body, False, 0.0
        if len(body) < 1024:
            return body, False, 0.0
        compressed = gzip.compress(body, compresslevel=5)
        return compressed, True, (time.perf_counter() - t0) * 1000.0

    def _send_json(self, status: int, payload: dict | list) -> dict:
        t_json_start = time.perf_counter()
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        json_ms = (time.perf_counter() - t_json_start) * 1000.0
        body, gzipped, gzip_ms = self._maybe_gzip(raw)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if gzipped:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BENIGN_NETWORK_ERRORS:
            return {
                "raw_bytes": len(raw),
                "out_bytes": len(body),
                "gzipped": gzipped,
                "json_ms": json_ms,
                "gzip_ms": gzip_ms,
            }
        return {
            "raw_bytes": len(raw),
            "out_bytes": len(body),
            "gzipped": gzipped,
            "json_ms": json_ms,
            "gzip_ms": gzip_ms,
        }

    def _send_no_content(self) -> None:
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        try:
            self.end_headers()
        except BENIGN_NETWORK_ERRORS:
            return

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
        t_total_start = time.perf_counter()
        parsed_url = urlparse(self.path)
        query = parse_qs(parsed_url.query, keep_blank_values=False)
        payload_label = "".join(query.get("payload", [""])).strip()
        if payload_label:
            payload_label = payload_label.replace("\n", " ").replace("\r", " ").strip()
            if len(payload_label) > 80:
                payload_label = payload_label[:80]
        parts = api_parts(self.path)
        if parts is None:
            return super().do_GET()

        if parts == ["health"]:
            metrics = self._send_json(200, {"ok": True})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="GET",
                path=self.path,
                status=200,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        if parts == ["stats"]:
            t_db_start = time.perf_counter()
            counts = count_records_by_store(["subjects", "topics", "cards"])
            db_ms = (time.perf_counter() - t_db_start) * 1000.0
            payload = {
                "subjects": int(counts.get("subjects", 0)),
                "topics": int(counts.get("topics", 0)),
                "cards": int(counts.get("cards", 0)),
            }
            metrics = self._send_json(200, payload)
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="GET",
                path=self.path,
                status=200,
                total_ms=total_ms,
                db_ms=db_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
                extra=f"store=stats{' payload=' + payload_label if payload_label else ''}",
            )
            return

        if len(parts) == 2:
            store = parts[0]
            if store not in KEY_FIELDS:
                metrics = self._send_json(404, {"error": f"Unknown store: {store}"})
                total_ms = (time.perf_counter() - t_total_start) * 1000.0
                self._trace_log(
                    method="GET",
                    path=self.path,
                    status=404,
                    total_ms=total_ms,
                    json_ms=float(metrics.get("json_ms", 0.0)),
                    gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                    raw_bytes=int(metrics.get("raw_bytes", 0)),
                    out_bytes=int(metrics.get("out_bytes", 0)),
                    gzipped=bool(metrics.get("gzipped", False)),
                )
                return

            key = unquote(parts[1])
            t_db_start = time.perf_counter()
            record = get_record(store, key)
            db_ms = (time.perf_counter() - t_db_start) * 1000.0
            if record is None:
                metrics = self._send_json(404, {"error": "Not found"})
                status = 404
                extra = f"store={store}"
            else:
                metrics = self._send_json(200, record)
                status = 200
                extra = f"store={store}"
            if payload_label:
                extra += f" payload={payload_label}"
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="GET",
                path=self.path,
                status=status,
                total_ms=total_ms,
                db_ms=db_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
                extra=extra,
            )
            return

        if len(parts) != 1:
            metrics = self._send_json(404, {"error": "Not found"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="GET",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        store = parts[0]
        if store not in KEY_FIELDS:
            metrics = self._send_json(404, {"error": f"Unknown store: {store}"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="GET",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        t_db_start = time.perf_counter()
        trace_extra = f"store={store}"
        if store == "topics":
            subject_ids = [value.strip() for value in query.get("subjectId", []) if value.strip()]
            include_counts_raw = "".join(query.get("includeCounts", [""])).strip().lower()
            include_counts = include_counts_raw in {"1", "true", "yes", "on"}
            if subject_ids:
                rows = list_records_by_json_field("topics", "subjectId", subject_ids)
                trace_extra += f" subjectId={subject_ids[0]}"
            else:
                rows = list_records("topics")
            if include_counts and rows:
                topic_ids = [str(row.get("id", "")).strip() for row in rows if str(row.get("id", "")).strip()]
                counts_by_topic_id = count_cards_by_topic_ids(topic_ids)
                enriched_rows: list[dict] = []
                for row in rows:
                    topic_id = str(row.get("id", "")).strip()
                    enriched_rows.append({**row, "cardCount": int(counts_by_topic_id.get(topic_id, 0))})
                rows = enriched_rows
                trace_extra += " includeCounts=1"
        elif store == "cards":
            card_ids = [value.strip() for value in query.get("cardId", []) if value.strip()]
            topic_ids = [value.strip() for value in query.get("topicId", []) if value.strip()]
            requested_fields: list[str] = []
            for raw_group in query.get("fields", []):
                for token in str(raw_group).split(","):
                    field = token.strip()
                    if not field:
                        continue
                    if not all(char.isalnum() or char == "_" for char in field):
                        continue
                    if field in requested_fields:
                        continue
                    requested_fields.append(field)
            if card_ids:
                rows = list_records_by_json_field("cards", "id", card_ids)
                trace_extra += f" cards={len(set(card_ids))}"
            elif topic_ids:
                rows = list_records_by_json_field("cards", "topicId", topic_ids)
                unique_topic_ids = sorted(set(topic_ids))
                trace_extra += f" topics={len(unique_topic_ids)}"
            else:
                rows = list_records("cards")
            if requested_fields:
                projected_rows: list[dict] = []
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    projected = {field: row.get(field) for field in requested_fields if field in row}
                    projected_rows.append(projected)
                rows = projected_rows
                fields_label = ",".join(requested_fields)
                if len(fields_label) > 80:
                    fields_label = fields_label[:80]
                trace_extra += f" fields={fields_label}"
        elif store == "progress":
            card_ids = [value.strip() for value in query.get("cardId", []) if value.strip()]
            if card_ids:
                rows = list_records_by_json_field("progress", "cardId", card_ids)
                trace_extra += f" cards={len(set(card_ids))}"
            else:
                rows = list_records("progress")
        else:
            rows = list_records(store)

        if payload_label:
            trace_extra += f" payload={payload_label}"

        db_ms = (time.perf_counter() - t_db_start) * 1000.0
        metrics = self._send_json(200, rows)
        total_ms = (time.perf_counter() - t_total_start) * 1000.0
        self._trace_log(
            method="GET",
            path=self.path,
            status=200,
            total_ms=total_ms,
            db_ms=db_ms,
            json_ms=float(metrics.get("json_ms", 0.0)),
            gzip_ms=float(metrics.get("gzip_ms", 0.0)),
            raw_bytes=int(metrics.get("raw_bytes", 0)),
            out_bytes=int(metrics.get("out_bytes", 0)),
            gzipped=bool(metrics.get("gzipped", False)),
            extra=f"{trace_extra} rows={len(rows)}",
        )
        return

    def do_PUT(self) -> None:
        t_total_start = time.perf_counter()
        parts = api_parts(self.path)
        if parts is None:
            metrics = self._send_json(404, {"error": "Not found"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="PUT",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        if len(parts) != 1:
            metrics = self._send_json(404, {"error": "Not found"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="PUT",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        store = parts[0]
        if store not in KEY_FIELDS:
            metrics = self._send_json(404, {"error": f"Unknown store: {store}"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="PUT",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        try:
            t_read_start = time.perf_counter()
            body = self._read_json_body()
            read_ms = (time.perf_counter() - t_read_start) * 1000.0
            t_db_start = time.perf_counter()
            record = upsert_record(store, body)
            db_ms = (time.perf_counter() - t_db_start) * 1000.0
        except ValueError as err:
            metrics = self._send_json(400, {"error": str(err)})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="PUT",
                path=self.path,
                status=400,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        metrics = self._send_json(200, record)
        total_ms = (time.perf_counter() - t_total_start) * 1000.0
        self._trace_log(
            method="PUT",
            path=self.path,
            status=200,
            total_ms=total_ms,
            db_ms=db_ms,
            json_ms=float(metrics.get("json_ms", 0.0)),
            gzip_ms=float(metrics.get("gzip_ms", 0.0)),
            raw_bytes=int(metrics.get("raw_bytes", 0)),
            out_bytes=int(metrics.get("out_bytes", 0)),
            gzipped=bool(metrics.get("gzipped", False)),
            extra=f"store={store} read_ms={read_ms:.1f}",
        )
        return

    def do_DELETE(self) -> None:
        t_total_start = time.perf_counter()
        parts = api_parts(self.path)
        if parts is None:
            metrics = self._send_json(404, {"error": "Not found"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="DELETE",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        if len(parts) != 2:
            metrics = self._send_json(404, {"error": "Not found"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="DELETE",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        store = parts[0]
        if store not in KEY_FIELDS:
            metrics = self._send_json(404, {"error": f"Unknown store: {store}"})
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            self._trace_log(
                method="DELETE",
                path=self.path,
                status=404,
                total_ms=total_ms,
                json_ms=float(metrics.get("json_ms", 0.0)),
                gzip_ms=float(metrics.get("gzip_ms", 0.0)),
                raw_bytes=int(metrics.get("raw_bytes", 0)),
                out_bytes=int(metrics.get("out_bytes", 0)),
                gzipped=bool(metrics.get("gzipped", False)),
            )
            return

        key = unquote(parts[1])
        t_db_start = time.perf_counter()
        delete_record(store, key)
        db_ms = (time.perf_counter() - t_db_start) * 1000.0
        self._send_no_content()
        total_ms = (time.perf_counter() - t_total_start) * 1000.0
        self._trace_log(
            method="DELETE",
            path=self.path,
            status=204,
            total_ms=total_ms,
            db_ms=db_ms,
            extra=f"store={store}",
        )
        return


class FlashcardsServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, BENIGN_NETWORK_ERRORS):
            return
        super().handle_error(request, client_address)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve flashcards app with shared SQLite backend")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    parser.add_argument(
        "--trace-requests",
        action="store_true",
        help="Print request timing breakdowns (useful for diagnosing slow clients like iPad/iPhone).",
    )
    parser.add_argument(
        "--trace-ip",
        default="",
        help="Only trace this client IP (example: 192.168.178.49).",
    )
    parser.add_argument(
        "--trace-slow-ms",
        type=float,
        default=0.0,
        help="Only print traces slower than this threshold in milliseconds.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()

    server = FlashcardsServer((args.host, args.port), FlashcardsHandler)
    server.trace_requests = bool(args.trace_requests)
    server.trace_ip = str(args.trace_ip or "").strip()
    server.trace_slow_ms = float(args.trace_slow_ms or 0.0)
    url_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    print(f"Flashcards server running on http://{url_host}:{args.port}")
    print(f"Database file: {DB_PATH}")
    if server.trace_requests:
        suffix = f" (ip={server.trace_ip})" if server.trace_ip else ""
        threshold = f", slow>{server.trace_slow_ms:.0f}ms" if server.trace_slow_ms > 0 else ""
        print(f"Request tracing enabled{suffix}{threshold}")
    server.serve_forever()


if __name__ == "__main__":
    main()

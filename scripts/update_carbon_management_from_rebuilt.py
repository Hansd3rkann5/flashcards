#!/usr/bin/env python3
"""
Rewrite Carbon Management Q/A content from carbon_management_rebuilt.json.

The script updates both `cards` and `cardbank` stores in flashcards.sqlite3.
It reuses existing card ids where possible and only inserts new ids for
questions that do not match existing cards.
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import re
import shutil
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path


TOPIC_NAME_MAP = {
    "Topic 1: Global Warming": "Global Warming",
    "Topic 2: Carbon": "Carbon",
    "Topic 3: Reporting": "Reporting",
    "Topic 4: Energy": "Energy",
    "Topic 5: Sector Solutions": "Sector Solutions",
}


def normalize(text: str) -> str:
    normalized = (text or "").strip().lower()
    normalized = (
        normalized.replace("´", "'")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("–", "-")
        .replace("—", "-")
        .replace("“", '"')
        .replace("”", '"')
    )
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def qid_number(question_id: str) -> int:
    match = re.search(r"\d+", question_id or "")
    return int(match.group(0)) if match else 0


def similarity_score(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 2.0

    shortest = min(len(a), len(b))
    longest = max(len(a), len(b))
    prefix_bonus = 0.0
    if shortest >= 24 and (a.startswith(b) or b.startswith(a)):
        prefix_bonus = 1.3 + (shortest / longest) * 0.5

    seq_ratio = difflib.SequenceMatcher(None, a, b).ratio()
    a_tokens = set(a.split())
    b_tokens = set(b.split())
    jaccard = (len(a_tokens & b_tokens) / len(a_tokens | b_tokens)) if (a_tokens or b_tokens) else 0.0
    token_score = jaccard * 0.95
    return max(prefix_bonus, seq_ratio, token_score)


@dataclass
class ExistingCard:
    card_id: str
    payload: dict
    norm_question: str
    norm_answer: str


def match_cards(
    existing_cards: list[ExistingCard],
    rebuilt_items: list[dict],
) -> tuple[dict[int, int], list[int], list[int], list[tuple[int, int, float]]]:
    """Return mapping new_idx -> existing_idx with one-to-one assignments."""
    mapped: dict[int, int] = {}
    scored_matches: list[tuple[int, int, float]] = []

    remaining_new = set(range(len(rebuilt_items)))
    remaining_existing = set(range(len(existing_cards)))

    existing_by_q: dict[str, list[int]] = {}
    for idx, card in enumerate(existing_cards):
        existing_by_q.setdefault(card.norm_question, []).append(idx)

    # Pass 1: exact normalized question match.
    for new_idx, item in enumerate(rebuilt_items):
        nq = normalize(item["question"])
        candidates = existing_by_q.get(nq, [])
        while candidates and candidates[0] not in remaining_existing:
            candidates.pop(0)
        if candidates:
            existing_idx = candidates.pop(0)
            mapped[new_idx] = existing_idx
            scored_matches.append((new_idx, existing_idx, 2.0))
            remaining_new.discard(new_idx)
            remaining_existing.discard(existing_idx)

    # Pass 2: high-confidence global matching.
    pairs: list[tuple[float, int, int]] = []
    for new_idx in remaining_new:
        nq = normalize(rebuilt_items[new_idx]["question"])
        for existing_idx in remaining_existing:
            score = similarity_score(nq, existing_cards[existing_idx].norm_question)
            pairs.append((score, new_idx, existing_idx))

    pairs.sort(reverse=True)
    for score, new_idx, existing_idx in pairs:
        if score < 0.60:
            break
        if new_idx not in remaining_new or existing_idx not in remaining_existing:
            continue
        mapped[new_idx] = existing_idx
        scored_matches.append((new_idx, existing_idx, score))
        remaining_new.discard(new_idx)
        remaining_existing.discard(existing_idx)

    # Pass 3: force map the leftovers best-first (keeps IDs stable when counts match).
    while remaining_new and remaining_existing:
        best: tuple[float, int, int] | None = None
        for new_idx in remaining_new:
            nq = normalize(rebuilt_items[new_idx]["question"])
            for existing_idx in remaining_existing:
                score = similarity_score(nq, existing_cards[existing_idx].norm_question)
                if best is None or score > best[0]:
                    best = (score, new_idx, existing_idx)
        assert best is not None
        score, new_idx, existing_idx = best
        mapped[new_idx] = existing_idx
        scored_matches.append((new_idx, existing_idx, score))
        remaining_new.discard(new_idx)
        remaining_existing.discard(existing_idx)

    return mapped, sorted(remaining_new), sorted(remaining_existing), scored_matches


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_card_payload(topic_id: str, question: str, answer: str, template: dict | None = None) -> dict:
    template = template or {}
    created_at = now_iso()
    payload = {
        "id": "",
        "topicId": topic_id,
        "type": template.get("type", "qa"),
        "textAlign": template.get("textAlign", "center"),
        "questionTextAlign": template.get("questionTextAlign", "center"),
        "answerTextAlign": template.get("answerTextAlign", "center"),
        "optionsTextAlign": template.get("optionsTextAlign", "left"),
        "prompt": question,
        "answer": answer,
        "options": template.get("options", []),
        "imagesQ": [],
        "imagesA": [],
        "imageDataQ": "",
        "imageDataA": "",
        "createdAt": created_at,
        "meta": {"createdAt": created_at, "updatedAt": created_at},
    }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="flashcards.sqlite3", help="Path to sqlite database")
    parser.add_argument("--json", default="carbon_management_rebuilt.json", help="Path to rebuilt JSON")
    parser.add_argument("--subject", default="Carbon Management", help="Subject name")
    parser.add_argument("--no-backup", action="store_true", help="Skip DB backup creation")
    args = parser.parse_args()

    db_path = Path(args.db)
    rebuilt_path = Path(args.json)
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    if not rebuilt_path.exists():
        raise SystemExit(f"Rebuilt JSON not found: {rebuilt_path}")

    if not args.no_backup:
        stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = db_path.with_name(f"{db_path.stem}.backup_before_carbon_update_{stamp}{db_path.suffix}")
        shutil.copy2(db_path, backup_path)
        print(f"Backup created: {backup_path}")

    rebuilt_raw = json.loads(rebuilt_path.read_text(encoding="utf-8"))
    expected_topics = list(TOPIC_NAME_MAP.keys())
    missing_topics = [t for t in expected_topics if t not in rebuilt_raw]
    if missing_topics:
        raise SystemExit(f"Rebuilt JSON missing topics: {missing_topics}")

    rebuilt_by_topic: dict[str, list[dict]] = {}
    for rebuilt_topic_key, app_topic_name in TOPIC_NAME_MAP.items():
        cards = sorted(rebuilt_raw[rebuilt_topic_key], key=lambda item: qid_number(item.get("question_id", "")))
        rebuilt_by_topic[app_topic_name] = cards

    conn = sqlite3.connect(str(db_path), timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        subject_row = conn.execute(
            """
            select record_key, payload
            from records
            where store='subjects' and json_extract(payload, '$.name') = ?
            limit 1
            """,
            (args.subject,),
        ).fetchone()
        if subject_row is None:
            raise SystemExit(f"Subject not found: {args.subject}")
        subject_id = subject_row["record_key"]

        topic_rows = conn.execute(
            """
            select record_key as topic_id, json_extract(payload, '$.name') as topic_name
            from records
            where store='topics' and json_extract(payload, '$.subjectId') = ?
            """,
            (subject_id,),
        ).fetchall()
        topic_id_by_name = {row["topic_name"]: row["topic_id"] for row in topic_rows}
        for app_topic_name in TOPIC_NAME_MAP.values():
            if app_topic_name not in topic_id_by_name:
                raise SystemExit(f"Topic not found under subject '{args.subject}': {app_topic_name}")

        existing_rows = conn.execute(
            """
            select c.record_key as card_id,
                   c.payload as payload,
                   json_extract(t.payload, '$.name') as topic_name
            from records c
            join records t
              on t.store='topics' and t.record_key=json_extract(c.payload, '$.topicId')
            where c.store='cards' and json_extract(t.payload, '$.subjectId') = ?
            """,
            (subject_id,),
        ).fetchall()

        existing_by_topic: dict[str, list[ExistingCard]] = {}
        for row in existing_rows:
            payload = json.loads(row["payload"])
            topic_name = row["topic_name"]
            existing_by_topic.setdefault(topic_name, []).append(
                ExistingCard(
                    card_id=row["card_id"],
                    payload=payload,
                    norm_question=normalize(payload.get("prompt", "")),
                    norm_answer=normalize(payload.get("answer", "")),
                )
            )

        total_updated = 0
        total_inserted = 0
        total_deleted = 0
        topic_summaries = []

        with conn:
            for topic_name, rebuilt_cards in rebuilt_by_topic.items():
                existing_cards = existing_by_topic.get(topic_name, [])
                mapped, unmatched_new, unmatched_existing, scored = match_cards(existing_cards, rebuilt_cards)

                low_confidence = sum(1 for _, _, s in scored if s < 0.75)
                if low_confidence:
                    print(f"[{topic_name}] low-confidence matches: {low_confidence}")

                topic_id = topic_id_by_name[topic_name]
                template_payload = existing_cards[0].payload if existing_cards else None

                updated_here = 0
                inserted_here = 0
                deleted_here = 0

                # Update/Upsert all rebuilt cards.
                for new_idx, rebuilt_item in enumerate(rebuilt_cards):
                    question = rebuilt_item["question"]
                    answer = rebuilt_item["answer"]
                    ts = int(time.time() * 1000)

                    if new_idx in mapped:
                        existing_idx = mapped[new_idx]
                        card = existing_cards[existing_idx]
                        payload = dict(card.payload)
                        changed = (
                            normalize(payload.get("prompt", "")) != normalize(question)
                            or normalize(payload.get("answer", "")) != normalize(answer)
                        )
                        payload["prompt"] = question
                        payload["answer"] = answer
                        payload.setdefault("topicId", topic_id)
                        payload["topicId"] = topic_id
                        meta = payload.get("meta")
                        if not isinstance(meta, dict):
                            meta = {}
                        meta["updatedAt"] = now_iso()
                        payload["meta"] = meta

                        if changed:
                            payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                            conn.execute(
                                "update records set payload=?, updated_at=? where store='cards' and record_key=?",
                                (payload_json, ts, card.card_id),
                            )
                            conn.execute(
                                "update records set payload=?, updated_at=? where store='cardbank' and record_key=?",
                                (payload_json, ts, card.card_id),
                            )
                            updated_here += 1
                    else:
                        new_id = str(uuid.uuid4())
                        payload = build_card_payload(topic_id=topic_id, question=question, answer=answer, template=template_payload)
                        payload["id"] = new_id
                        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                        conn.execute(
                            "insert into records(store, record_key, payload, updated_at) values ('cards', ?, ?, ?)",
                            (new_id, payload_json, ts),
                        )
                        conn.execute(
                            "insert into records(store, record_key, payload, updated_at) values ('cardbank', ?, ?, ?)",
                            (new_id, payload_json, ts),
                        )
                        inserted_here += 1

                # Delete leftovers if any existing cards were not matched to rebuilt source.
                # This keeps DB exactly aligned to rebuilt JSON.
                for existing_idx in unmatched_existing:
                    card_id = existing_cards[existing_idx].card_id
                    conn.execute("delete from records where store='cards' and record_key=?", (card_id,))
                    conn.execute("delete from records where store='cardbank' and record_key=?", (card_id,))
                    deleted_here += 1

                total_updated += updated_here
                total_inserted += inserted_here
                total_deleted += deleted_here
                topic_summaries.append((topic_name, len(existing_cards), len(rebuilt_cards), updated_here, inserted_here, deleted_here))

        print("\nTopic summary:")
        for topic_name, existing_count, rebuilt_count, updated_here, inserted_here, deleted_here in topic_summaries:
            print(
                f"- {topic_name}: existing={existing_count}, rebuilt={rebuilt_count}, "
                f"updated={updated_here}, inserted={inserted_here}, deleted={deleted_here}"
            )

        verify_rows = conn.execute(
            """
            select json_extract(t.payload, '$.name') as topic_name, count(*) as cnt
            from records c
            join records t
              on t.store='topics' and t.record_key=json_extract(c.payload, '$.topicId')
            where c.store='cards' and json_extract(t.payload, '$.subjectId')=?
            group by topic_name
            order by topic_name
            """,
            (subject_id,),
        ).fetchall()
        print("\nPost-update counts:")
        total_cards = 0
        for row in verify_rows:
            total_cards += int(row["cnt"])
            print(f"- {row['topic_name']}: {row['cnt']}")
        print(f"Total cards in '{args.subject}': {total_cards}")
        print(f"Mutations: updated={total_updated}, inserted={total_inserted}, deleted={total_deleted}")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Extract flashcards from Vaia-like HTML exports into the app's JSON import format.

Output format:
{
  "cards": [
    {
      "subject": "...",
      "topic": "...",
      "question": "...",
      "answer": "...",
      "type": "qa|mcq",
      "options": [{"text": "...", "correct": true}]
    }
  ]
}

Typical usage:
python3 scripts/extract_vaia_html_to_json.py \
  --input vaia_content.html \
  --output polymer_technologie_injection_molding_import.json \
  --subject "Polymer Technologie"
"""

from __future__ import annotations

import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List


BLOCK_TAGS = {"p", "div", "li", "tr", "br", "ul", "ol", "table"}
PLACEHOLDER_VALUES = {"frfrf"}


def _normalize_ws_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def clean_text(raw: str) -> str:
    text = str(raw or "").replace("\xa0", " ")
    lines = [_normalize_ws_line(line) for line in text.split("\n")]
    lines = [line for line in lines if line]
    merged = "\n".join(lines)
    # Keep punctuation tight.
    return re.sub(r"\s+([,.;:!?])", r"\1", merged).strip()


def normalize_side(raw: str) -> str:
    value = clean_text(raw).upper()
    if value.startswith("Q"):
        return "Q"
    if value.startswith("A"):
        return "A"
    return ""


def append_images_to_text(text: str, images: List[str], include_images: bool = True) -> str:
    safe_text = clean_text(text)
    if not include_images:
        return safe_text
    unique_images: List[str] = []
    seen = set()
    for src in images:
        value = str(src or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique_images.append(value)
    if not unique_images:
        return safe_text
    marker_lines = "\n".join(f"[Image] {src}" for src in unique_images)
    if safe_text:
        return f"{safe_text}\n{marker_lines}"
    return marker_lines


def extract_tag_topic(raw: str) -> str:
    text = clean_text(raw)
    if not text:
        return ""
    lower = text.lower()
    if text.startswith("+"):
        return ""
    if "tags hinzufügen" in lower:
        return ""
    if "add tag" in lower:
        return ""
    return text


def remove_image_markers(text: str) -> str:
    cleaned = re.sub(r"\[Image\]\s*\S+", " ", str(text or ""), flags=re.IGNORECASE)
    return clean_text(cleaned)


class FlashcardExtractor(HTMLParser):
    """
    Parses two card layouts:
    1) Vaia preview cards: <app-flashcard-list-item> with two <app-flashcard-froala-view> blocks.
    2) App card tiles: alternating "card-tile-title" (Q/A) + "card-tile-body".
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)

        self.in_card = False
        self.card_depth = 0
        self.current_card: Dict[str, Any] | None = None
        self.cards: List[Dict[str, Any]] = []

        # QA sides rendered by app-flashcard-froala-view.
        self.in_view = False
        self.view_depth = 0
        self.current_view: Dict[str, List[str]] | None = None

        # MCQ options rendered by app-multiple-choice-option.
        self.in_mcq_option = False
        self.mcq_option_depth = 0
        self.current_option: Dict[str, Any] | None = None
        self.in_option_froala = False
        self.option_froala_depth = 0

        # Topic tags rendered as .tag-text.
        self.in_tag_text = False
        self.tag_text_depth = 0
        self.tag_text_parts: List[str] = []

    @staticmethod
    def _get_class(attrs: Dict[str, str]) -> str:
        return str(attrs.get("class", "")).strip()

    @staticmethod
    def _extract_image_src(attrs: Dict[str, str]) -> str:
        data_src = str(attrs.get("data-image-source", "")).strip()
        src = str(attrs.get("src", "")).strip()
        return data_src or src

    def _append_block_breaks(self) -> None:
        if self.in_view and self.current_view is not None:
            self.current_view["parts"].append("\n")
        if self.in_option_froala and self.current_option is not None:
            self.current_option["parts"].append("\n")

    def _finalize_view(self) -> None:
        if not self.current_view or not self.current_card:
            return
        text = clean_text("".join(self.current_view["parts"]))
        images = [str(src or "").strip() for src in self.current_view["images"] if str(src or "").strip()]
        self.current_card["views"].append({"text": text, "images": images})
        self.current_view = None

    def _finalize_option(self) -> None:
        if not self.current_option or not self.current_card:
            return
        text = clean_text("".join(self.current_option["parts"]))
        images = [str(src or "").strip() for src in self.current_option["images"] if str(src or "").strip()]
        text = append_images_to_text(text, images, include_images=True)
        if text:
            self.current_card["mcq_options"].append(
                {"text": text, "correct": bool(self.current_option.get("correct", False))}
            )
        self.current_option = None

    def _finalize_tag(self) -> None:
        if not self.current_card:
            self.tag_text_parts = []
            return
        text = extract_tag_topic("".join(self.tag_text_parts))
        if text:
            tags = self.current_card.setdefault("tags", [])
            tags.append(text)
        self.tag_text_parts = []

    @staticmethod
    def _dedupe_options(options: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        deduped: List[Dict[str, Any]] = []
        seen = {}
        for opt in options:
            text = clean_text(str(opt.get("text", "")))
            if not text:
                continue
            correct = bool(opt.get("correct", False))
            key = text.lower()
            if key in seen:
                # If one duplicate says correct, keep it correct.
                seen[key]["correct"] = bool(seen[key]["correct"] or correct)
                continue
            item = {"text": text, "correct": correct}
            seen[key] = item
            deduped.append(item)
        return deduped

    def _finalize_card(self) -> None:
        if not self.current_card:
            return
        views: List[Dict[str, Any]] = self.current_card.get("views", [])
        tags: List[str] = self.current_card.get("tags", [])
        topic = tags[0] if tags else ""

        mcq_options = self._dedupe_options(self.current_card.get("mcq_options", []))
        if mcq_options:
            question = ""
            if views:
                question = append_images_to_text(
                    str(views[0].get("text", "")),
                    list(views[0].get("images", [])),
                    include_images=True,
                )
            correct_texts = [str(opt["text"]) for opt in mcq_options if bool(opt.get("correct", False))]
            answer = "\n".join(correct_texts).strip()
            if not answer and mcq_options:
                answer = str(mcq_options[0]["text"])
            if question and answer:
                self.cards.append(
                    {
                        "topic": topic,
                        "question": question,
                        "answer": answer,
                        "type": "mcq",
                        "options": [{"text": str(opt["text"]), "correct": bool(opt["correct"])} for opt in mcq_options],
                    }
                )
            self.current_card = None
            return

        if len(views) >= 2:
            question = append_images_to_text(
                str(views[0].get("text", "")),
                list(views[0].get("images", [])),
                include_images=True,
            )
            answer = append_images_to_text(
                str(views[1].get("text", "")),
                list(views[1].get("images", [])),
                include_images=True,
            )
            if question and answer:
                self.cards.append({"topic": topic, "question": question, "answer": answer, "type": "qa"})
        self.current_card = None

    def handle_starttag(self, tag: str, attrs_list: List[tuple[str, str | None]]) -> None:
        attrs = {k: (v or "") for k, v in attrs_list}
        cls = self._get_class(attrs)

        if tag == "app-flashcard-list-item":
            if not self.in_card:
                self.in_card = True
                self.card_depth = 1
                self.current_card = {"views": [], "tags": [], "mcq_options": []}
            else:
                self.card_depth += 1
            return

        if not self.in_card:
            return

        if tag == "app-flashcard-froala-view":
            if not self.in_view:
                self.in_view = True
                self.view_depth = 1
                self.current_view = {"parts": [], "images": []}
            else:
                self.view_depth += 1
            return

        if tag == "app-multiple-choice-option":
            if not self.in_mcq_option:
                self.in_mcq_option = True
                self.mcq_option_depth = 1
                self.current_option = {"parts": [], "images": [], "correct": False}
            else:
                self.mcq_option_depth += 1
            return

        if self.in_mcq_option and tag == "app-froala-view":
            if not self.in_option_froala:
                self.in_option_froala = True
                self.option_froala_depth = 1
            else:
                self.option_froala_depth += 1
            return

        if tag == "div":
            if self.in_tag_text:
                self.tag_text_depth += 1
            elif "tag-text" in cls and "one-line-only" in cls:
                self.in_tag_text = True
                self.tag_text_depth = 1
                self.tag_text_parts = []

            if self.in_mcq_option and "answer-option-wrapper" in cls:
                classes = set(cls.split())
                if "correct-answer" in classes:
                    self.current_option["correct"] = True
                elif "wrong-answer" in classes:
                    self.current_option["correct"] = False

        if tag in BLOCK_TAGS:
            self._append_block_breaks()

        if tag == "img":
            src = self._extract_image_src(attrs)
            if not src:
                return
            if self.in_view and self.current_view is not None:
                self.current_view["images"].append(src)
            if self.in_option_froala and self.current_option is not None:
                self.current_option["images"].append(src)

    def handle_endtag(self, tag: str) -> None:
        if tag == "app-flashcard-list-item" and self.in_card:
            self.card_depth -= 1
            if self.card_depth <= 0:
                self.in_card = False
                self.card_depth = 0
                self._finalize_card()
            return

        if not self.in_card:
            return

        if tag == "app-flashcard-froala-view" and self.in_view:
            self.view_depth -= 1
            if self.view_depth <= 0:
                self.in_view = False
                self.view_depth = 0
                self._finalize_view()
            return

        if tag == "app-froala-view" and self.in_option_froala:
            self.option_froala_depth -= 1
            if self.option_froala_depth <= 0:
                self.in_option_froala = False
                self.option_froala_depth = 0
            return

        if tag == "app-multiple-choice-option" and self.in_mcq_option:
            self.mcq_option_depth -= 1
            if self.mcq_option_depth <= 0:
                self.in_mcq_option = False
                self.mcq_option_depth = 0
                self._finalize_option()
            return

        if self.in_tag_text and tag == "div":
            self.tag_text_depth -= 1
            if self.tag_text_depth <= 0:
                self.in_tag_text = False
                self.tag_text_depth = 0
                self._finalize_tag()
            return

        if tag in {"p", "div", "li", "tr"}:
            self._append_block_breaks()

    def handle_data(self, data: str) -> None:
        if self.in_view and self.current_view is not None:
            self.current_view["parts"].append(data)
        if self.in_option_froala and self.current_option is not None:
            self.current_option["parts"].append(data)
        if self.in_tag_text:
            self.tag_text_parts.append(data)

    def finalize(self) -> None:
        self._finalize_view()
        self._finalize_option()
        self._finalize_tag()
        self._finalize_card()


def dedupe_cards(cards: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique: List[Dict[str, Any]] = []
    seen = set()
    for card in cards:
        q = clean_text(str(card.get("question", "")))
        a = clean_text(str(card.get("answer", "")))
        if not q or not a:
            continue
        normalized = {
            "topic": clean_text(str(card.get("topic", ""))),
            "question": q,
            "answer": a,
            "type": str(card.get("type", "qa")).strip().lower() or "qa",
            "options": card.get("options", []),
        }
        key = json.dumps(normalized, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        unique.append(card)
    return unique


def filter_placeholders(cards: List[Dict[str, Any]], keep_placeholders: bool) -> List[Dict[str, Any]]:
    if keep_placeholders:
        return cards
    filtered: List[Dict[str, Any]] = []
    for card in cards:
        q = clean_text(str(card.get("question", "")))
        a = clean_text(str(card.get("answer", "")))
        if q.lower() in PLACEHOLDER_VALUES and a.lower() in PLACEHOLDER_VALUES:
            continue
        filtered.append(card)
    return filtered


def build_rows(
    cards: List[Dict[str, Any]],
    subject: str,
    default_topic: str,
    include_images: bool,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for card in cards:
        question = clean_text(str(card.get("question", "")))
        answer = clean_text(str(card.get("answer", "")))
        topic = clean_text(str(card.get("topic", ""))) or default_topic
        safe_type = str(card.get("type", "qa")).strip().lower()
        if safe_type not in {"qa", "mcq"}:
            safe_type = "qa"
        options_raw = card.get("options", [])
        options: List[Dict[str, Any]] = []
        if isinstance(options_raw, list):
            for opt in options_raw:
                if not isinstance(opt, dict):
                    continue
                text = clean_text(str(opt.get("text", "")))
                if not text:
                    continue
                options.append({"text": text, "correct": bool(opt.get("correct", False))})

        if not include_images:
            question = remove_image_markers(question)
            answer = remove_image_markers(answer)
            if options:
                for opt in options:
                    opt["text"] = remove_image_markers(str(opt["text"]))
                options = [opt for opt in options if str(opt["text"]).strip()]

        if not question or not answer:
            continue
        row: Dict[str, Any] = {
            "subject": subject,
            "topic": topic,
            "question": question,
            "answer": answer,
        }
        if safe_type == "mcq" and options:
            row["type"] = "mcq"
            row["options"] = options
        rows.append(row)
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract flashcards from Vaia-like HTML to JSON import format.")
    parser.add_argument("--input", required=True, help="Path to source HTML file.")
    parser.add_argument("--output", required=True, help="Path to target JSON file.")
    parser.add_argument("--subject", required=True, help="Subject name to set on all extracted cards.")
    parser.add_argument(
        "--default-topic",
        "--topic",
        dest="default_topic",
        default="Imported Topic",
        help="Fallback topic if no usable tag-text topic is found for a card.",
    )
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="Do not de-duplicate by question+answer pairs.",
    )
    parser.add_argument(
        "--keep-placeholders",
        action="store_true",
        help="Keep obvious placeholder cards like 'frfrf'.",
    )
    parser.add_argument(
        "--no-image-markers",
        action="store_true",
        help="Remove '[Image] ...' markers from output question/answer text.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        raise FileNotFoundError(f"Input HTML not found: {input_path}")

    html = input_path.read_text(encoding="utf-8", errors="ignore")
    extractor = FlashcardExtractor()
    extractor.feed(html)
    extractor.finalize()

    combined = extractor.cards
    combined = filter_placeholders(combined, keep_placeholders=bool(args.keep_placeholders))
    if not args.no_dedupe:
        combined = dedupe_cards(combined)

    rows = build_rows(
        combined,
        subject=str(args.subject).strip(),
        default_topic=clean_text(str(args.default_topic).strip()) or "Imported Topic",
        include_images=not bool(args.no_image_markers),
    )
    payload = {"cards": rows}
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    topic_detected_count = sum(1 for card in combined if clean_text(str(card.get("topic", ""))))
    mcq_count = sum(1 for card in rows if str(card.get("type", "")).lower() == "mcq")

    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Raw cards parsed: {len(extractor.cards)}")
    print(f"Cards with detected topic tag: {topic_detected_count}")
    print(f"MCQ cards detected: {mcq_count}")
    print(f"Final cards written: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

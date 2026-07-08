"""Resolve curated modernist volumes via the Gutendex catalog API, download
their plain text, strip Project Gutenberg boilerplate, and split into
individual poem records.

Gutendex (https://gutendex.com) is a JSON API over the Project Gutenberg
catalog. We search by title, optionally filter by author, take English books
that expose a text/plain format, download, and segment.

Segmentation is heuristic (poetry volumes vary): poems are split on runs of
3+ blank lines; front/back matter and prose chunks are dropped. Imperfect but
adequate for style-transfer. Resumable: books already in the output are skipped.

    python -m src.sources.gutenberg [--force] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time

import requests

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent.parent))
from src.common import (  # noqa: E402
    RAW,
    ROOT,
    read_jsonl,
    write_jsonl,
    strip_gutenberg_boilerplate,
    lines_to_stanza_lines,
    is_probably_prose,
)

OUT = RAW / "gutenberg.jsonl"
CONFIG = ROOT / "configs" / "gutenberg_volumes.json"
GUTENDEX = "https://gutendex.com/books"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "exquisite-corpse-corpus/0.1 (research; HF milwright)"

_JUNK = re.compile(
    r"\b(CONTENTS|INDEX|TRANSCRIBER|GUTENBERG|COPYRIGHT|ALL RIGHTS RESERVED|"
    r"PRINTED IN|BIBLIOGRAPH|ACKNOWLEDG|PREFACE|INTRODUCTION|FOOTNOTE|ILLUSTRATION)\b",
    re.I,
)


def _get_json(url: str, params=None, tries=4):
    for i in range(tries):
        try:
            r = SESSION.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1.5 * (i + 1))
    return None


def _get_text(url: str, tries=3):
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=60)
            if r.status_code == 200:
                r.encoding = r.apparent_encoding or "utf-8"
                return r.text
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1.5 * (i + 1))
    return None


def resolve_book(q: dict):
    """Return (book_dict, text_url) for the best Gutendex match, or None."""
    data = _get_json(GUTENDEX, params={"search": q["title"]})
    if not data or not data.get("results"):
        return None
    want_author = (q.get("author") or "").lower()
    for book in data["results"]:
        if "en" not in (book.get("languages") or []):
            continue
        if want_author:
            authors = " ".join(a.get("name", "") for a in book.get("authors", [])).lower()
            if want_author not in authors:
                continue
        fmts = book.get("formats", {})
        text_url = None
        for k, v in fmts.items():
            if k.startswith("text/plain") and not v.endswith(".zip"):
                text_url = v
                break
        if text_url:
            return book, text_url
    return None


def segment_poems(body: str) -> list[list[str]]:
    """Split a volume body into candidate poems on 3+ blank lines."""
    body = re.sub(r"\n{3,}", "\n\n\n", body)
    chunks = re.split(r"\n\s*\n\s*\n", body)
    poems = []
    for ch in chunks:
        if _JUNK.search(ch[:200]):
            continue
        lines = lines_to_stanza_lines(ch)
        body_lines = [l for l in lines if l.strip()]
        if len(body_lines) < 2 or len(body_lines) > 240:
            continue
        if is_probably_prose(lines):
            continue
        poems.append(lines)
    return poems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="max queries this run (0=all)")
    args = ap.parse_args()

    queries = json.loads(CONFIG.read_text())["queries"]
    records: list[dict] = []
    done_books = set()
    if OUT.exists() and not args.force:
        for r in read_jsonl(OUT):
            records.append(r)
            done_books.add(r["meta"].get("gutenberg_id"))
        print(f"resume: {len(records)} poems from {len(done_books)} books")

    processed = 0
    for q in queries:
        if args.limit and processed >= args.limit:
            break
        resolved = resolve_book(q)
        if not resolved:
            print(f"  miss: {q['title']} ({q.get('author')})")
            continue
        book, text_url = resolved
        gid = book["id"]
        if gid in done_books:
            continue
        processed += 1
        text = _get_text(text_url)
        if not text:
            print(f"  dl-fail: {book['title']} [{gid}]")
            continue
        body = strip_gutenberg_boilerplate(text)
        author = (book.get("authors") or [{}])[0].get("name", q.get("author") or "Unknown")
        poems = segment_poems(body)
        for lines in poems:
            title = lines[0][:120] if lines else ""
            records.append(
                {
                    "source": f"gutenberg:{gid}",
                    "title": title,
                    "author": author,
                    "year": None,
                    "lines": lines,
                    "meta": {"gutenberg_id": gid, "volume": book["title"], "tag": q.get("tag")},
                }
            )
        done_books.add(gid)
        print(f"  ok: {book['title'][:50]} [{gid}] -> {len(poems)} poems (total {len(records)})")
        write_jsonl(OUT, records)  # checkpoint after every book
        time.sleep(0.5)

    print(f"wrote {len(records)} poems -> {OUT}")


if __name__ == "__main__":
    main()

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


def _text_url(book: dict):
    for k, v in (book.get("formats") or {}).items():
        if k.startswith("text/plain") and not v.endswith(".zip"):
            return v
    return None


def resolve_book(q: dict, max_pages: int = 3):
    """Return (book_dict, text_url) for the best Gutendex match, or None.

    Improvements over v1: direct ebook-id support; search combines title+author
    for better ranking; paginates several pages; matches on the author's *last
    name* so 'Sandburg'/'Untermeyer' anthologies aren't missed."""
    # explicit ebook id short-circuits search
    if q.get("gid"):
        data = _get_json(GUTENDEX, params={"ids": q["gid"]})
        book = (data or {}).get("results", [None])[0] if data else None
        if book and _text_url(book):
            return book, _text_url(book)

    author = (q.get("author") or "").strip()
    last = author.split()[-1].lower() if author else ""
    search = f"{q['title']} {author}".strip() if author else q["title"]

    url, params, page = GUTENDEX, {"search": search}, 0
    while url and page < max_pages:
        data = _get_json(url, params=params)
        if not data:
            break
        for book in data.get("results", []):
            if "en" not in (book.get("languages") or []):
                continue
            if last:
                authors = " ".join(a.get("name", "") for a in book.get("authors", [])).lower()
                if last not in authors:
                    continue
            tu = _text_url(book)
            if tu:
                return book, tu
        url, params = data.get("next"), None  # `next` is a full URL
        page += 1
    return None


def _split_chunks(body: str, blanks: int) -> list[list[str]]:
    sep = r"\n\s*" * blanks + r"\n"
    poems = []
    for ch in re.split(sep, body):
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


def _median_len(poems: list[list[str]]) -> float:
    sizes = sorted(len([l for l in p if l.strip()]) for p in poems)
    return sizes[len(sizes) // 2] if sizes else 0.0


def segment_poems(body: str) -> list[list[str]]:
    """Split a volume into candidate poems. Default separator is 3+ blank lines,
    but volumes that separate poems with a *single* blank line (e.g. Spoon River's
    epitaphs) get lumped — so if the coarse split yields few or huge chunks, fall
    back to a 2-blank split and keep whichever is better-proportioned."""
    coarse = _split_chunks(body, 3)
    # coarse looks wrong when it barely split or lumped long blocks together
    if len(coarse) < 5 or _median_len(coarse) > 60:
        fine = _split_chunks(body, 2)
        if len(fine) > len(coarse) and 3 <= _median_len(fine) <= 60:
            return fine
    return coarse


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

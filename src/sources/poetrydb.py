"""Fetch the full PoetryDB corpus (public-domain canon) into raw poem records.

PoetryDB (https://poetrydb.org) exposes poems already split into a `lines`
array, which is exactly our unit. We enumerate all authors, then pull each
author's poems. ~130 authors / ~3k poems. Resumable: re-runs skip authors
already saved unless --force.

    python -m src.sources.poetrydb [--force]
"""
from __future__ import annotations

import argparse
import sys
import time

import requests

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent.parent))
from src.common import RAW, read_jsonl, write_jsonl, clean_line  # noqa: E402

OUT = RAW / "poetrydb.jsonl"
API = "https://poetrydb.org"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "exquisite-corpse-corpus/0.1 (research; contact via HF milwright)"


def _get(path: str, tries: int = 4):
    for i in range(tries):
        try:
            r = SESSION.get(f"{API}{path}", timeout=30)
            if r.status_code == 200:
                return r.json()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                print(f"  ! {path}: {e}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None


def normalize_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    blank = False
    for ln in lines:
        c = clean_line(ln)
        if c.strip() == "":
            blank = True
            continue
        if blank and out:
            out.append("")
        blank = False
        out.append(c)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    done_authors = set()
    records: list[dict] = []
    if OUT.exists() and not args.force:
        for r in read_jsonl(OUT):
            records.append(r)
            done_authors.add(r["author"])
        print(f"resume: {len(records)} poems, {len(done_authors)} authors already saved")

    authors = _get("/author")
    if not authors:
        print("could not fetch author list; aborting", file=sys.stderr)
        sys.exit(1)
    authors = authors["authors"]
    print(f"{len(authors)} authors total")

    for i, author in enumerate(authors, 1):
        if author in done_authors:
            continue
        data = _get(f"/author/{requests.utils.quote(author)}")
        if not isinstance(data, list):
            continue
        for poem in data:
            lines = normalize_lines(poem.get("lines", []))
            if len(lines) < 2:
                continue
            records.append(
                {
                    "source": "poetrydb",
                    "title": (poem.get("title") or "").strip(),
                    "author": author,
                    "year": None,
                    "lines": lines,
                    "meta": {"linecount": poem.get("linecount")},
                }
            )
        print(f"[{i}/{len(authors)}] {author}: total poems so far {len(records)}")
        # checkpoint every 10 authors so a crash/cron-kill keeps progress
        if i % 10 == 0:
            write_jsonl(OUT, records)
        time.sleep(0.3)

    n = write_jsonl(OUT, records)
    print(f"wrote {n} poems -> {OUT}")


if __name__ == "__main__":
    main()

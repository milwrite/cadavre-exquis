"""Gutenberg Poetry Corpus (Allison Parrish) — ~3M lines of public-domain
verse from ~3k Project Gutenberg books, as ndjson: {"s": line, "gid": bookid}.

Poem boundaries are NOT preserved, but *consecutive lines within a gid are
consecutive in the source*, so next-line adjacency is real. We group by gid,
chunk each run into fixed-length pseudo-poems, and tag them source="gpc".
These are down-weighted at dataset-build time (breadth/regularization, not the
surrealist core). Bounded by --max. Cached download; resumable.

    python -m src.sources.gutenberg_corpus [--max N] [--window W]
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import urllib.request
from collections import defaultdict

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent.parent))
from src.common import RAW, write_jsonl, clean_line  # noqa: E402

OUT = RAW / "gpc.jsonl"
GZ = RAW / "gutenberg-poetry-v001.ndjson.gz"
URLS = [
    "http://static.decontextualize.com/gutenberg-poetry-v001.ndjson.gz",
    "https://static.decontextualize.com/gutenberg-poetry-v001.ndjson.gz",
]


def download():
    if GZ.exists() and GZ.stat().st_size > 1_000_000:
        print(f"cached: {GZ} ({GZ.stat().st_size/1e6:.1f} MB)")
        return True
    for url in URLS:
        try:
            print(f"downloading {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "exquisite-corpse/0.1"})
            with urllib.request.urlopen(req, timeout=120) as r, GZ.open("wb") as f:
                f.write(r.read())
            print(f"  saved {GZ.stat().st_size/1e6:.1f} MB")
            return True
        except Exception as e:  # noqa: BLE001
            print(f"  fail: {e}", file=sys.stderr)
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=15000, help="max pseudo-poems to emit")
    ap.add_argument("--window", type=int, default=12, help="lines per pseudo-poem")
    args = ap.parse_args()

    if not download():
        print("could not obtain GPC; skipping (clean sources still stand)", file=sys.stderr)
        sys.exit(0)

    by_gid: dict[str, list[str]] = defaultdict(list)
    with gzip.open(GZ, "rt", encoding="utf-8") as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            s = clean_line(o.get("s", ""))
            if s.strip():
                by_gid[str(o.get("gid"))].append(s)
    print(f"{len(by_gid)} books, {sum(len(v) for v in by_gid.values())} lines")

    records: list[dict] = []
    w = args.window
    # round-robin across gids so we sample breadth, not one giant book, before --max
    gids = sorted(by_gid, key=lambda g: (-len(by_gid[g]), g))
    cursors = {g: 0 for g in gids}
    active = list(gids)
    while active and len(records) < args.max:
        still = []
        for g in active:
            i = cursors[g]
            chunk = by_gid[g][i : i + w]
            cursors[g] = i + w
            if len(chunk) >= 4:
                records.append(
                    {
                        "source": "gpc",
                        "title": "",
                        "author": "Various (Gutenberg Poetry Corpus)",
                        "year": None,
                        "lines": chunk,
                        "meta": {"gutenberg_id": g},
                    }
                )
                if len(records) >= args.max:
                    break
            if cursors[g] < len(by_gid[g]):
                still.append(g)
        active = still

    n = write_jsonl(OUT, records)
    print(f"wrote {n} pseudo-poems -> {OUT}")


if __name__ == "__main__":
    main()

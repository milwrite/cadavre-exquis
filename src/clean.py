"""Merge every data/raw/*.jsonl source into one cleaned, de-duplicated
poems.jsonl. Clean sources win over GPC padding on duplicate content.

Filters: >=3 and <=200 non-blank lines; English or undetermined; not prose.
Dedup key is normalized content (so the same poem from two sources collapses).

    python -m src.clean
Writes data/interim/poems.jsonl and prints a provenance summary.
"""
from __future__ import annotations

import sys
from collections import Counter

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from src.common import (  # noqa: E402
    RAW,
    INTERIM,
    read_jsonl,
    write_jsonl,
    clean_line,
    content_hash,
    detect_lang,
    is_probably_prose,
    is_section_label,
)

OUT = INTERIM / "poems.jsonl"
# lower number = higher priority when the same poem appears in multiple sources
SOURCE_PRIORITY = ["poetrydb.jsonl", "gutenberg.jsonl", "gpc.jsonl"]
MIN_LINES, MAX_LINES = 3, 200


def reclean(lines: list[str]) -> list[str]:
    out: list[str] = []
    blank = False
    for ln in lines:
        c = clean_line(ln)
        if c.strip() == "" or is_section_label(c):
            blank = True  # treat a dropped section label as a stanza break
            continue
        if blank and out:
            out.append("")
        blank = False
        out.append(c)
    return out


def main() -> None:
    files = [RAW / f for f in SOURCE_PRIORITY if (RAW / f).exists()]
    # include any other raw sources added later, at lowest priority
    for extra in sorted(RAW.glob("*.jsonl")):
        if extra not in files:
            files.append(extra)
    if not files:
        print("no raw sources found; run a src.sources.* fetcher first", file=sys.stderr)
        sys.exit(1)

    seen: set[str] = set()
    kept: list[dict] = []
    stats = Counter()
    for f in files:
        for r in read_jsonl(f):
            stats[f"in::{f.stem}"] += 1
            lines = reclean(r.get("lines", []))
            body = [l for l in lines if l.strip()]
            if not (MIN_LINES <= len(body) <= MAX_LINES):
                stats["drop::length"] += 1
                continue
            joined = "\n".join(body)
            if len(joined) < 40:
                stats["drop::tiny"] += 1
                continue
            if is_probably_prose(lines):
                stats["drop::prose"] += 1
                continue
            lang = detect_lang(joined)
            if lang not in ("en", "unknown"):
                stats["drop::lang"] += 1
                continue
            pid = content_hash(lines)
            if pid in seen:
                stats["drop::dup"] += 1
                continue
            seen.add(pid)
            kept.append(
                {
                    "id": pid,
                    "source": r.get("source"),
                    "title": r.get("title", ""),
                    "author": r.get("author", ""),
                    "year": r.get("year"),
                    "lines": lines,
                    "n_lines": len(body),
                    "char_len": len(joined),
                    "lang": lang,
                }
            )
            stats[f"kept::{f.stem}"] += 1

    n = write_jsonl(OUT, kept)
    print(f"\nwrote {n} unique poems -> {OUT}\n")
    for k in sorted(stats):
        print(f"  {k}: {stats[k]}")
    src_counts = Counter(r["source"].split(":")[0] for r in kept)
    print("\nby source family:")
    for k, v in src_counts.most_common():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()

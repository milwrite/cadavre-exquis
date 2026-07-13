"""Shared utilities for the surrealist-corpus pipeline.

Every stage reads/writes JSON Lines. A *poem record* is the common unit:

    {
      "source":  str,          # provenance, e.g. "poetrydb" | "gutenberg:1567" | "gpc"
      "title":   str,
      "author":  str,
      "year":    int | None,   # publication year if known
      "lines":   [str, ...],   # poem lines; "" marks a stanza (blank-line) break
      "meta":    {...}         # source-specific extras
    }

Cleaning adds: id, n_lines, char_len, lang.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import unicodedata
from typing import Iterable, Iterator

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
PROCESSED = DATA / "processed"
for _p in (RAW, INTERIM, PROCESSED):
    _p.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- jsonl io
def write_jsonl(path: pathlib.Path, records: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n


def read_jsonl(path: pathlib.Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


# ---------------------------------------------------------------- text
def normalize_text(s: str) -> str:
    """NFC-normalize encoding; keep punctuation, diacritics, and case intact
    (those are signal in modernist verse). Only fix newlines and tabs."""
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    # collapse runs of spaces but preserve leading indentation intent loosely
    s = re.sub(r"[  ]{2,}", " ", s)
    return s


_FOOTNOTE = re.compile(r"\[\s*\d{1,3}\s*\]")  # Gutenberg editorial refs: [2], [12]


def clean_line(line: str) -> str:
    s = normalize_text(line)
    s = _FOOTNOTE.sub("", s)
    return s.rstrip()


_SECTION_LABEL = re.compile(r"^\s*(\d{1,3}|[IVXLC]{2,7}\.?|[IVXLC]\.)\s*$")


def is_section_label(line: str) -> bool:
    """A line that is only a stanza/section number or roman-numeral header —
    structural scaffolding, not verse. (Bare single 'I' is kept: could be the
    pronoun; we only drop 'I.' or multi-char numerals.)"""
    return bool(_SECTION_LABEL.match(line))


def lines_to_stanza_lines(raw: str) -> list[str]:
    """Split a poem body into lines, collapsing 2+ blank lines to a single ""
    stanza marker. Leading/trailing blanks trimmed."""
    out: list[str] = []
    blank = False
    for ln in normalize_text(raw).split("\n"):
        ln = ln.rstrip()
        if ln.strip() == "":
            blank = True
            continue
        if blank and out:
            out.append("")  # single stanza break
        blank = False
        out.append(ln)
    return out


def content_hash(lines: list[str]) -> str:
    """Stable id from normalized non-blank content (whitespace/case-insensitive)
    so the same poem from two sources collapses to one id."""
    key = "\n".join(l.strip().lower() for l in lines if l.strip())
    key = re.sub(r"[^\w\n]+", " ", key)
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------- language
_lang_cache: dict = {}


def detect_lang(text: str) -> str:
    """Coarse language id. Returns 'en', a code, or 'unknown'. Short texts are
    unreliable, so callers should only *drop* on a confident non-en verdict."""
    try:
        from langdetect import detect, DetectorFactory  # type: ignore

        DetectorFactory.seed = 0
        sample = " ".join(text.split())
        if len(sample) < 20:
            return "unknown"
        return detect(sample)
    except Exception:
        return "unknown"


# ---------------------------------------------------------------- gutenberg
_PG_START = re.compile(r"\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*", re.I | re.S)
_PG_END = re.compile(r"\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*", re.I | re.S)


def strip_gutenberg_boilerplate(text: str) -> str:
    """Return only the body between the START/END markers."""
    text = text.replace("\r\n", "\n")
    m = _PG_START.search(text)
    if m:
        text = text[m.end():]
    m = _PG_END.search(text)
    if m:
        text = text[: m.start()]
    return text.strip("\n")


def is_probably_prose(lines: list[str]) -> bool:
    """Heuristic: prose has long lines and ends with sentence punctuation often.
    Verse tends to have shorter, irregularly-broken lines."""
    body = [l for l in lines if l.strip()]
    if not body:
        return True
    avg_len = sum(len(l) for l in body) / len(body)
    long_frac = sum(1 for l in body if len(l) > 88) / len(body)
    return avg_len > 78 and long_frac > 0.5


# ---------------------------------------------------------------- front-matter
# Publisher/printer title-page colophons ("NEW YORK / HOUGHTON MIFFLIN COMPANY /
# 1915") slip past the segmenter's _JUNK filter (they carry none of CONTENTS/
# PREFACE/etc.) and become bogus 3–6 line "poems". They share a narrow signature
# of *imprint signals*: an imprint place, a publisher/printer name, a bare year,
# a street address. Keying on >=2 *distinct* signals in a short chunk is precise
# enough to spare real short all-caps poems (Stein's Tender Buttons, Pound).
# NOTE: each alternative carries its own boundary; do NOT wrap the whole group in
# \b(...)\b — a leading \b can never anchor the &-prefixed alternatives.
_FM_YEAR = re.compile(r"^[\(\[]?\s*(1[6-9]\d\d|20[0-2]\d)\s*[\)\].,]?$")
_FM_PUB = re.compile(
    r"(?:\bPUBLISHERS?\b|\bPUBLISHING\b|\bCOMPANY\b|&\s?CO\.?\b|\bINCORPORATED\b|"
    r"&\s?SONS\b|&\s?BRO(?:THERS)?\b|\bLTD\b|\bLIMITED\b|\bMIFFLIN\b|\bHOUGHTON\b|"
    r"\bMACMILLAN\b|\bSCRIBNER\b|\bHARCOURT\b|\b\w+\s+PRESS\b|\bPRINTED\s+(?:BY|IN|AT)\b)",
    re.I,
)
_FM_PLACE = re.compile(
    r"^\s*(NEW YORK|BOSTON|LONDON|CHICAGO|PHILADELPHIA|CAMBRIDGE|EDINBURGH|"
    r"BOSTON AND NEW YORK|NEW YORK AND LONDON)"
    r"(\s*[.,]\s*(MASS(ACHUSETTS)?|N\.?Y\.?|ENGLAND|U\.?\s?S\.?\s?A\.?))?\s*$",
    re.I,
)
_FM_ADDR = re.compile(r"\b\d{1,4}\b.*\b(AVENUE|AVE|STREET|\bST\b|ROAD|SQUARE|PLACE)\b", re.I)


def is_front_matter(lines: list[str]) -> bool:
    """True for a short publisher/printer title-page colophon (not a poem).

    Fires only when a chunk of <=8 non-blank lines carries >=2 *distinct* imprint
    signal kinds (place / publisher / bare year / street address). See the note
    above; validated to flag 9 imprint records in the corpus with zero false
    positives against real short poems."""
    body = [l.strip() for l in lines if l.strip()]
    if not body or len(body) > 8:
        return False
    kinds = set()
    for l in body:
        if _FM_YEAR.match(l):
            kinds.add("year")
        if _FM_PLACE.match(l):
            kinds.add("place")
        if _FM_PUB.search(l):
            kinds.add("pub")
        if _FM_ADDR.search(l):
            kinds.add("addr")
        if len(kinds) >= 2:
            return True
    return False

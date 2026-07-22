"""Regression tests for the pure pipeline logic.

Stdlib `unittest` only — no new dependency, runs on the cron box out of the box:

    .venv/bin/python -m unittest discover -s tests

These lock in the *subtle, silent* transforms whose bugs would corrupt the
corpus without ever raising — the kind an autonomous daily cron run could
reintroduce unnoticed. Each test cites the PROGRESS.md follow-up it guards.
The corpus data itself is not touched; these are unit tests over the functions.
"""
from __future__ import annotations

import pathlib
import sys
import unittest

# repo root on sys.path so `import src.*` works no matter the CWD
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.common import (  # noqa: E402
    clean_line,
    content_hash,
    is_front_matter,
    is_probably_prose,
    is_section_label,
    lines_to_stanza_lines,
    strip_gutenberg_boilerplate,
)
from src.build_dataset import (  # noqa: E402
    INSTRUCTION,
    assemble_examples,
    examples_for,
    poem_split,
)
from src.sources.gutenberg import segment_poems  # noqa: E402


class TestFrontMatter(unittest.TestCase):
    """follow-up #6 — drop publisher/printer title-page colophons, keep poems."""

    def test_colophon_place_publisher_year_fires(self):
        # place + publisher + year = 3 distinct imprint kinds -> not a poem
        self.assertTrue(is_front_matter(["NEW YORK", "HOUGHTON MIFFLIN COMPANY", "1915"]))

    def test_ampersand_co_alternative_not_silently_killed(self):
        # Regression for the documented \b gotcha: a group-level \b(...|&CO|...)\b
        # can never anchor the &-prefixed alternatives, so each alternative must
        # carry its own boundary. "& CO." (publisher) + a place = 2 kinds -> fires.
        self.assertTrue(is_front_matter(["BOSTON", "SMITH & CO."]))

    def test_real_short_poem_survives(self):
        # Stein, "Tender Buttons" — short all-caps head, but zero imprint signals.
        self.assertFalse(
            is_front_matter([
                "A CARAFE, THAT IS A BLIND GLASS.",
                "A kind in glass and a cousin,",
                "a spectacle and nothing strange",
            ])
        )

    def test_single_signal_does_not_fire(self):
        # A bare year alone is only ONE kind; needs >=2 distinct kinds.
        self.assertFalse(is_front_matter(["1915", "a line of verse", "another line"]))

    def test_over_eight_nonblank_lines_never_fires(self):
        # The guard: colophons are short; >8 non-blank lines is treated as verse.
        lines = ["NEW YORK", "HOUGHTON MIFFLIN COMPANY", "1915"] + [f"verse {i}" for i in range(8)]
        self.assertFalse(is_front_matter(lines))


class TestSectionLabel(unittest.TestCase):
    """Structural scaffolding vs. verse — the bare-'I' pronoun edge case."""

    def test_bare_I_kept(self):
        self.assertFalse(is_section_label("I"))  # could be the pronoun

    def test_dotted_roman_dropped(self):
        self.assertTrue(is_section_label("I."))

    def test_multichar_roman_dropped(self):
        self.assertTrue(is_section_label("II"))
        self.assertTrue(is_section_label("XIV"))

    def test_bare_number_dropped(self):
        self.assertTrue(is_section_label("12"))

    def test_verse_line_not_a_label(self):
        self.assertFalse(is_section_label("I wandered lonely as a cloud"))


class TestContentHash(unittest.TestCase):
    """Dedup key: same poem from two sources must collapse to one id."""

    def test_case_and_whitespace_insensitive(self):
        self.assertEqual(content_hash(["The  Sea", "rolls ON"]), content_hash(["the sea", "rolls on"]))

    def test_blank_lines_ignored(self):
        self.assertEqual(content_hash(["a", "", "b"]), content_hash(["a", "b"]))

    def test_different_content_differs(self):
        self.assertNotEqual(content_hash(["a", "b"]), content_hash(["a", "c"]))


class TestLinesToStanza(unittest.TestCase):
    def test_multiple_blanks_collapse_to_single_marker(self):
        out = lines_to_stanza_lines("a\n\n\n\nb")
        self.assertEqual(out, ["a", "", "b"])

    def test_leading_and_trailing_blanks_trimmed(self):
        self.assertEqual(lines_to_stanza_lines("\n\na\nb\n\n"), ["a", "b"])


class TestCleanLine(unittest.TestCase):
    def test_editorial_footnote_ref_stripped(self):
        self.assertEqual(clean_line("A line with a ref[12] here"), "A line with a ref here")

    def test_tab_becomes_space(self):
        self.assertEqual(clean_line("a\tb"), "a b")


class TestProse(unittest.TestCase):
    def test_long_lines_flagged_prose(self):
        prose = ["x" * 100 for _ in range(4)]
        self.assertTrue(is_probably_prose(prose))

    def test_short_verse_not_prose(self):
        self.assertFalse(is_probably_prose(["the moon", "a bone", "the sea"]))

    def test_empty_is_prose(self):
        self.assertTrue(is_probably_prose([]))


class TestGutenbergBoilerplate(unittest.TestCase):
    def test_body_extracted_between_markers(self):
        raw = (
            "junk header\n"
            "*** START OF THE PROJECT GUTENBERG EBOOK FOO ***\n"
            "the poem body\n"
            "*** END OF THE PROJECT GUTENBERG EBOOK FOO ***\n"
            "license junk"
        )
        self.assertEqual(strip_gutenberg_boilerplate(raw), "the poem body")


class TestExamplesFor(unittest.TestCase):
    """build_dataset: slice a poem into next-line pairs (loss on assistant)."""

    def _poem(self, lines):
        return {"id": "p1", "source": "poetrydb", "lines": lines}

    def test_one_example_per_predictable_target(self):
        # 4 lines -> targets at k=1,2,3 (k=0 has no context) = 3 examples
        exs = examples_for(self._poem(["a", "b", "c", "d"]), 24)
        self.assertEqual(len(exs), 3)

    def test_message_structure(self):
        exs = examples_for(self._poem(["a", "b"]), 24)
        msgs = exs[0]["messages"]
        self.assertEqual(msgs[0]["role"], "user")
        self.assertTrue(msgs[0]["content"].startswith(INSTRUCTION))
        self.assertEqual(msgs[1]["role"], "assistant")
        self.assertEqual(msgs[1]["content"], "b")  # target is the next line

    def test_stanza_break_never_a_target(self):
        # "" (stanza marker) must not be predicted as an assistant target
        exs = examples_for(self._poem(["a", "", "b"]), 24)
        targets = [e["messages"][1]["content"] for e in exs]
        self.assertNotIn("", targets)
        self.assertEqual(targets, ["b"])

    def test_context_is_bounded(self):
        exs = examples_for(self._poem(["a", "b", "c", "d", "e"]), 2)
        # last example predicts "e" from at most the 2 preceding lines
        ctx = exs[-1]["messages"][0]["content"].split("\n\n", 1)[1]
        self.assertEqual(ctx.count("\n") + 1, 2)


class TestPoemSplit(unittest.TestCase):
    """Deterministic, by-poem 95/5 split so no poem leaks across train/val."""

    def test_deterministic(self):
        self.assertEqual(poem_split("abc123", 0.05), poem_split("abc123", 0.05))

    def test_val_frac_zero_is_all_train(self):
        self.assertEqual(poem_split("anything", 0.0), "train")

    def test_val_frac_one_is_all_val(self):
        self.assertEqual(poem_split("anything", 1.0), "val")


class TestSegmentPoems(unittest.TestCase):
    """follow-up #2 — 2-blank coarse split, 1-blank fallback for lumped volumes."""

    def test_coarse_two_blank_split(self):
        poems = ["\n".join([f"line {i}a", f"line {i}b", f"line {i}c"]) for i in range(5)]
        body = "\n\n\n".join(poems)  # two blank lines (3 newlines) between poems
        self.assertEqual(len(segment_poems(body)), 5)

    def test_single_blank_fallback_for_spoon_river(self):
        # Epitaphs separated by ONE blank line: a 2-blank split lumps them into
        # one giant chunk, so the fallback to a 1-blank split must recover them.
        epitaphs = ["\n".join([f"epitaph {i} one", f"epitaph {i} two", f"epitaph {i} three"]) for i in range(6)]
        body = "\n\n".join(epitaphs)  # single blank line (2 newlines) between poems
        self.assertEqual(len(segment_poems(body)), 6)


class TestAssembleExamples(unittest.TestCase):
    """follow-up #3 (genre balance) — the load-bearing GPC-padding transform,
    extracted from build_dataset.main() as a pure function so it can be tested.

    Two invariants keep the modernist core dominant and the eval set honest:
      * GPC padding is subsampled to at most `gpc_ratio` x the core-train count.
      * GPC never enters val (val must measure the real target genre).
    A silent regression here (cap dropped, or GPC leaking into val) would swamp
    the corpus with padding or contaminate held-out eval — no crash, no signal.
    The shipped run: core_train=152584, gpc_train_used=int(152584*0.5)=76292.
    """

    def _poem(self, pid, source, n_lines):
        # n_lines lines -> examples_for yields n_lines-1 next-line examples
        return {"id": pid, "source": source, "lines": [f"{pid}-{i}" for i in range(n_lines)]}

    def test_gpc_capped_to_ratio_of_core_train(self):
        # val_frac=0 -> every poem lands in train. 2 core poems x 3 lines = 4
        # core-train examples; cap = int(4 * 0.5) = 2. The gpc poem yields 5
        # examples (6 lines), so it MUST be subsampled down to the cap of 2.
        poems = [
            self._poem("c1", "poetrydb", 3),
            self._poem("c2", "gutenberg:1", 3),
            self._poem("g1", "gpc", 6),
        ]
        train, val, summary = assemble_examples(poems, val_frac=0.0, gpc_ratio=0.5, max_ctx_lines=24)
        self.assertEqual(summary["core_train"], 4)
        self.assertEqual(summary["gpc_train_used"], 2)          # capped, not 5
        self.assertEqual(summary["train_examples"], 6)          # 4 core + 2 gpc
        self.assertEqual(len(train), 6)
        self.assertEqual(val, [])

    def test_gpc_never_enters_val(self):
        # val_frac=1.0 -> all poems route to val. Core examples become val;
        # gpc examples on a val poem are DROPPED (never val, never train).
        poems = [
            self._poem("c1", "poetrydb", 4),
            self._poem("g1", "gpc", 6),
        ]
        train, val, summary = assemble_examples(poems, val_frac=1.0, gpc_ratio=0.5, max_ctx_lines=24)
        self.assertTrue(all(not str(e["meta"]["source"]).startswith("gpc") for e in val))
        self.assertEqual(summary["gpc_train_used"], 0)
        self.assertEqual(train, [])
        self.assertEqual(len(val), 3)                           # c1: 4 lines -> 3 examples

    def test_gpc_kept_whole_when_under_cap(self):
        # gpc under the cap is NOT subsampled: 2 core poems (4 core-train, cap=2)
        # plus a 2-line gpc poem (1 example, <= 2) -> that lone gpc example stays.
        poems = [
            self._poem("c1", "poetrydb", 3),
            self._poem("c2", "gutenberg:1", 3),
            self._poem("g1", "gpc", 2),
        ]
        _, _, summary = assemble_examples(poems, val_frac=0.0, gpc_ratio=0.5, max_ctx_lines=24)
        self.assertEqual(summary["gpc_train_used"], 1)

    def test_deterministic_ordering(self):
        # The sha1 sort is a deterministic shuffle: same input -> same order.
        poems = [self._poem(f"p{i}", "poetrydb" if i % 2 else "gpc", 4) for i in range(6)]
        a, _, _ = assemble_examples(poems, val_frac=0.0, gpc_ratio=0.5, max_ctx_lines=24)
        b, _, _ = assemble_examples(poems, val_frac=0.0, gpc_ratio=0.5, max_ctx_lines=24)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()

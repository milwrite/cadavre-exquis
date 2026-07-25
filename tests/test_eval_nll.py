"""Tests for the pure scoring logic of train/eval_nll.py (quantitative eval).

The eval script asks the vLLM host to echo the prompt with logprobs, then
isolates the *gold next line's* tokens by character offset. That slicing is the
silent-failure surface: off-by-one on the span boundaries would quietly score
the chat-template markers (or the model's freshly generated token) as if they
were the poem line, and every number in docs/eval-nll.md would be wrong while
the script exits 0. Stdlib unittest only, same as tests/test_pipeline.py.
"""
from __future__ import annotations

import math
import pathlib
import sys
import unittest

# repo root on sys.path so `import train.*` works no matter the CWD
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from train.eval_nll import sum_target_logprobs, summarize  # noqa: E402


class TestSumTargetLogprobs(unittest.TestCase):
    def test_sums_only_tokens_inside_target_span(self):
        # Prompt tokens at offsets 0/5/10/15; a generated token continues at 20
        # (== len(prompt), as vLLM reports it). Target span is [10, 20): the two
        # gold-line tokens count, the prefix and the generated token never do.
        logprobs = {
            "text_offset": [0, 5, 10, 15, 20],
            "token_logprobs": [None, -1.0, -2.0, -3.0, -4.0],
            "tokens": ["<bos>", "pre", "gold", "line", "gen"],
        }
        total, n = sum_target_logprobs(logprobs, 10, 20)
        self.assertEqual(n, 2)
        self.assertAlmostEqual(total, -5.0)

    def test_skips_leading_none_logprob(self):
        # The first echoed token has token_logprobs=None (no context to score
        # it). With a span starting at 0 it must be skipped, not crash or count.
        logprobs = {
            "text_offset": [0, 5],
            "token_logprobs": [None, -1.5],
            "tokens": ["<bos>", "tok"],
        }
        total, n = sum_target_logprobs(logprobs, 0, 10)
        self.assertEqual(n, 1)
        self.assertAlmostEqual(total, -1.5)

    def test_token_starting_at_span_end_is_excluded(self):
        # hi is exclusive: a token starting exactly at the end-of-turn marker
        # offset belongs to the template, not the gold line.
        logprobs = {
            "text_offset": [0, 4],
            "token_logprobs": [-1.0, -2.0],
            "tokens": ["gold", "<turn|>"],
        }
        total, n = sum_target_logprobs(logprobs, 0, 4)
        self.assertEqual(n, 1)
        self.assertAlmostEqual(total, -1.0)


class TestSummarize(unittest.TestCase):
    def test_reports_per_token_nll_ppl_and_win_rate(self):
        # Two examples as (base_logprob_sum, tuned_logprob_sum, n_tokens):
        # tuned wins the first, loses the second -> win rate 0.5.
        pairs = [(-4.0, -2.0, 2), (-3.0, -3.5, 1)]
        s = summarize(pairs)
        self.assertEqual(s["n"], 2)
        self.assertEqual(s["tokens"], 3)
        self.assertAlmostEqual(s["base_nll"], 7.0 / 3)
        self.assertAlmostEqual(s["tuned_nll"], 5.5 / 3)
        self.assertAlmostEqual(s["base_ppl"], math.exp(7.0 / 3))
        self.assertAlmostEqual(s["tuned_ppl"], math.exp(5.5 / 3))
        self.assertAlmostEqual(s["win_rate"], 0.5)


if __name__ == "__main__":
    unittest.main()

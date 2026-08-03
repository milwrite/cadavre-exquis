"""Quantitative base-vs-tuned eval: gold-line NLL / perplexity via the live vLLM host.

The qualitative sheet (train/eval_vllm.py -> docs/eval-e4b.md) shows what each
model *writes* at temp 0.8; this measures what each model *expects*: the
token-level negative log-likelihood the base (`unsloth/gemma-4-E4B-it`) and the
tuned adapter (`exquisite-corpse`) assign to the *gold* held-out next lines.
Both models are already resident on the multi-LoRA host, so this needs no GPU
reload, no training deps beyond the (cached) tokenizer, and never touches data/.

Method: render each val example with the base tokenizer's own chat template
(exactly what vLLM applies at serve time; `add_special_tokens: false` so the
template's <bos> isn't doubled), ask /v1/completions to echo the prompt with
logprobs, and sum the logprobs of the tokens whose text_offset falls inside the
gold line's character span. Base and adapter share one tokenizer, so both score
the identical token sequence and the comparison is exact.

    .venv/bin/python train/eval_nll.py [--n 400] [--seed 11]
Writes docs/eval-nll.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent
VAL = ROOT / "data" / "processed" / "next_line.val.jsonl"
OUT = ROOT / "docs" / "eval-nll.md"
ENDPOINT = "http://127.0.0.1:1234/v1/completions"
BASE, TUNED = "unsloth/gemma-4-E4B-it", "exquisite-corpse"


def sum_target_logprobs(logprobs: dict, lo: int, hi: int) -> tuple[float, int]:
    """Sum echoed token logprobs for tokens starting inside [lo, hi).

    `logprobs` is the OpenAI-shape object from a completions response with
    echo=true: parallel `text_offset` / `token_logprobs` lists covering the
    prompt tokens then any generated ones (whose offsets continue past the
    prompt, so `hi` excludes them). The first echoed token scores None
    (nothing to condition on) and is skipped.
    """
    total, n = 0.0, 0
    for off, lp in zip(logprobs["text_offset"], logprobs["token_logprobs"]):
        if lp is None or not (lo <= off < hi):
            continue
        total += lp
        n += 1
    return total, n


def val_fingerprint(raw: bytes) -> str:
    """Pin the exact val file a report measured: record count + content hash.

    The val set changes as the corpus evolves (follow-ups #4/#7 both moved it),
    and this report is regenerated in place — without a fingerprint, NLL
    numbers from different val snapshots look comparable but aren't.
    """
    n = len(raw.splitlines())
    return f"{n} examples, sha256 {hashlib.sha256(raw).hexdigest()[:12]}"


def summarize(pairs: list[tuple[float, float, int]]) -> dict:
    """Aggregate (base_logprob_sum, tuned_logprob_sum, n_tokens) per example."""
    ntok = sum(n for _, _, n in pairs)
    base_nll = -sum(b for b, _, _ in pairs) / ntok
    tuned_nll = -sum(t for _, t, _ in pairs) / ntok
    return {
        "n": len(pairs),
        "tokens": ntok,
        "base_nll": base_nll,
        "tuned_nll": tuned_nll,
        "base_ppl": math.exp(base_nll),
        "tuned_ppl": math.exp(tuned_nll),
        "win_rate": sum(1 for b, t, _ in pairs if t > b) / len(pairs),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    # Heavy imports stay inside main so the pure functions above are testable
    # without transformers installed.
    import requests
    from transformers import AutoTokenizer

    tk = AutoTokenizer.from_pretrained(BASE)
    raw = VAL.read_bytes()
    val_id = val_fingerprint(raw)
    rows = [json.loads(l) for l in raw.splitlines()]
    rng = random.Random(args.seed)
    rng.shuffle(rows)
    rows = rows[: args.n]

    sess = requests.Session()

    def score(model: str, text: str, lo: int, hi: int) -> tuple[float, int]:
        r = sess.post(ENDPOINT, timeout=120, json={
            "model": model, "prompt": text, "max_tokens": 1, "temperature": 0,
            "echo": True, "logprobs": 0, "add_special_tokens": False})
        r.raise_for_status()
        return sum_target_logprobs(r.json()["choices"][0]["logprobs"], lo, hi)

    pairs: list[tuple[float, float, int]] = []
    for i, row in enumerate(rows, 1):
        msgs = row["messages"]
        prefix = tk.apply_chat_template(
            msgs[:-1], tokenize=False, add_generation_prompt=True)
        full = tk.apply_chat_template(
            msgs, tokenize=False, add_generation_prompt=False)
        if not full.startswith(prefix):  # template drift would misplace the span
            raise SystemExit(f"template render mismatch on example {i}")
        lo, hi = len(prefix), len(prefix) + len(msgs[-1]["content"])
        b_lp, b_n = score(BASE, full, lo, hi)
        t_lp, t_n = score(TUNED, full, lo, hi)
        if b_n == 0 or b_n != t_n:  # shared tokenizer -> identical tokens; guard anyway
            print(f"skip {i}: token mismatch base={b_n} tuned={t_n}")
            continue
        pairs.append((b_lp, t_lp, b_n))
        if i % 50 == 0:
            print(f"{i}/{len(rows)}")

    s = summarize(pairs)
    delta = s["base_nll"] - s["tuned_nll"]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join([
        "# Gold-line NLL — base vs tuned (gemma-4-E4B · exquisite-corpse)\n",
        f"{s['n']} held-out val examples · {s['tokens']} gold-line tokens · "
        f"seed {args.seed} · scored via the live vLLM host (echo+logprobs, "
        "teacher-forced on the gold next line).\n",
        f"Val set: `data/processed/next_line.val.jsonl` ({val_id}). Reports "
        "against different fingerprints are **not comparable** — the corpus "
        "moves between runs.\n",
        "| model | NLL/token | perplexity |",
        "|---|---|---|",
        f"| base `{BASE}` | {s['base_nll']:.4f} | {s['base_ppl']:.2f} |",
        f"| tuned `{TUNED}` | {s['tuned_nll']:.4f} | {s['tuned_ppl']:.2f} |",
        "",
        f"- Δ NLL/token (base − tuned): **{delta:.4f}** "
        f"(tuned is e^Δ ≈ ×{math.exp(delta):.2f} more likely per token)",
        f"- Per-example win rate (tuned assigns the gold line more total "
        f"probability): **{s['win_rate']:.1%}** of {s['n']}",
        "",
        "Both models score the *same* rendered text with the *same* tokenizer;",
        "only the LoRA weights differ, so the gap is attributable to the",
        "fine-tune. Reproduce: `.venv/bin/python train/eval_nll.py "
        f"--n {args.n} --seed {args.seed}`.",
        "",
    ]))
    print(f"wrote {OUT}")
    print(f"base  nll/tok {s['base_nll']:.4f}  ppl {s['base_ppl']:.2f}")
    print(f"tuned nll/tok {s['tuned_nll']:.4f}  ppl {s['tuned_ppl']:.2f}")
    print(f"win rate {s['win_rate']:.1%}  (n={s['n']})")


if __name__ == "__main__":
    main()

"""Base-vs-tuned readout WITHOUT reloading the model: both the base
(`unsloth/gemma-4-E4B-it`) and the tuned adapter (`exquisite-corpse`) are already
live on the vLLM host, so we just query the same held-out prefixes against each.
Avoids the GPU contention that blocks train/eval_compare.py while vLLM is up.

    .venv/bin/python train/eval_vllm.py [--n 12]
Writes docs/eval-e4b.md.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import random

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
VAL = ROOT / "data" / "processed" / "next_line.val.jsonl"
OUT = ROOT / "docs" / "eval-e4b.md"
ENDPOINT = "http://127.0.0.1:1234/v1/chat/completions"
BASE, TUNED = "unsloth/gemma-4-E4B-it", "exquisite-corpse"


def gen(model: str, messages, max_tokens=24) -> str:
    r = requests.post(ENDPOINT, timeout=60, json={
        "model": model, "messages": messages,
        "max_tokens": max_tokens, "temperature": 0.8, "top_p": 0.95})
    r.raise_for_status()
    txt = (r.json()["choices"][0]["message"]["content"] or "").strip()
    return txt.splitlines()[0] if txt else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=12)
    args = ap.parse_args()

    rows = [json.loads(l) for l in VAL.open()]
    rng = random.Random(11)
    rng.shuffle(rows)
    rows = [r for r in rows if r["meta"].get("k", 0) >= 3][: args.n]

    out = ["# Base vs tuned — exquisite-corpse (gemma-4-E4B)\n",
           f"{len(rows)} held-out prefixes · same prompt to base and adapter via vLLM · temp 0.8\n"]
    for i, r in enumerate(rows, 1):
        msgs = [r["messages"][0]]
        gold = r["messages"][1]["content"]
        base = gen(BASE, msgs)
        tuned = gen(TUNED, msgs)
        ctx = "\n".join(msgs[0]["content"].split("\n\n", 1)[-1].splitlines()[-4:])
        out += [f"\n## {i}. `{r['meta']['source']}`",
                "```\n… " + ctx.replace("`", "'") + "\n```",
                f"- gold:  `{gold}`",
                f"- base:  `{base}`",
                f"- tuned: `{tuned}`"]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(out))
    print(f"wrote {OUT}  ({len(rows)} prefixes)")


if __name__ == "__main__":
    main()

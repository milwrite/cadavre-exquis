"""Qualitative eval: base vs QLoRA-tuned next-line continuations on held-out
validation prefixes. Writes a side-by-side Markdown report to outputs/eval.md.

Loads the tuned adapter (which pulls its base too) and toggles the adapter off
to get the base model's answer for the *same* prompt — so the comparison is
apples-to-apples on one GPU load.

    .venv/bin/python train/eval_compare.py --n 12
Env: LORA_DIR (default outputs/lora), MAX_NEW_TOKENS (default 24).
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent
VAL = ROOT / "data" / "processed" / "next_line.val.jsonl"
OUT = ROOT / "outputs" / "eval.md"


def sample_prefixes(n: int, seed: int = 7):
    rows = [json.loads(l) for l in VAL.open()]
    rng = random.Random(seed)
    rng.shuffle(rows)
    # prefer prefixes with some context so the continuation is meaningful
    rows = [r for r in rows if r["meta"].get("k", 0) >= 3] or rows
    return rows[:n]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=12)
    args = ap.parse_args()
    if not VAL.exists():
        raise SystemExit("no val set — run: python -m src.build_dataset")

    lora_dir = os.environ.get("LORA_DIR", str(ROOT / "outputs" / "lora"))
    max_new = int(os.environ.get("MAX_NEW_TOKENS", "24"))

    from unsloth import FastModel  # type: ignore
    from unsloth.chat_templates import get_chat_template  # type: ignore
    import torch  # type: ignore

    model, tokenizer = FastModel.from_pretrained(
        model_name=lora_dir, max_seq_length=1024, load_in_4bit=True)
    tokenizer = get_chat_template(tokenizer, chat_template="gemma-3")
    FastModel.for_inference(model)

    def gen(messages) -> str:
        inputs = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(input_ids=inputs, max_new_tokens=max_new,
                                 do_sample=True, temperature=0.9, top_p=0.95)
        text = tokenizer.decode(out[0][inputs.shape[1]:], skip_special_tokens=True)
        return text.strip().splitlines()[0] if text.strip() else ""

    rows = sample_prefixes(args.n)
    lines = ["# Base vs tuned — next-line continuation\n",
             f"Adapter: `{lora_dir}` · {len(rows)} held-out prefixes · sample temp 0.9\n"]
    for i, r in enumerate(rows, 1):
        msgs = [r["messages"][0]]
        gold = r["messages"][1]["content"]
        tuned = gen(msgs)
        with model.disable_adapter():  # base model, same prompt
            base = gen(msgs)
        ctx_tail = "\n".join(msgs[0]["content"].split("\n\n", 1)[-1].splitlines()[-4:])
        lines += [
            f"\n## {i}. source `{r['meta']['source']}`",
            "```\n… " + ctx_tail.replace("`", "'") + "\n```",
            f"- **gold next line:** `{gold}`",
            f"- **base:** `{base}`",
            f"- **tuned:** `{tuned}`",
        ]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

"""Turn cleaned poems into next-line-continuation chat examples for Unsloth.

For a poem L1..Ln, for each non-blank target line Lk (k>=1) we emit:
    user:      INSTRUCTION + "\n\n" + join(L1..L{k-1})   (stanza breaks kept)
    assistant: Lk

Messages are stored structurally (role/content) and MODEL-AGNOSTIC — the Gemma
chat template is applied at train time via tokenizer.apply_chat_template, and
loss is masked to the assistant line (train_on_responses_only). Splitting is
BY POEM (95/5) so no poem's lines leak across train/val. GPC padding examples
are subsampled so the modernist core dominates.

    python -m src.build_dataset [--val-frac 0.05] [--gpc-ratio 0.5] [--max-ctx-lines 24]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from src.common import INTERIM, PROCESSED, read_jsonl, write_jsonl  # noqa: E402

POEMS = INTERIM / "poems.jsonl"
INSTRUCTION = (
    "Continue the poem. Given the lines so far, write only the next line "
    "— no title, no commentary, no quotation marks."
)


def poem_split(pid: str, val_frac: float) -> str:
    h = int(hashlib.sha1(pid.encode()).hexdigest(), 16) % 10000
    return "val" if h < val_frac * 10000 else "train"


def examples_for(poem: dict, max_ctx_lines: int):
    lines = poem["lines"]
    out = []
    for k in range(1, len(lines)):
        target = lines[k]
        if target.strip() == "":  # never predict a stanza break as a target
            continue
        ctx = lines[:k]
        if not any(c.strip() for c in ctx):
            continue
        ctx = ctx[-max_ctx_lines:]  # bound context; token truncation happens at train
        user = INSTRUCTION + "\n\n" + "\n".join(ctx)
        out.append(
            {
                "messages": [
                    {"role": "user", "content": user},
                    {"role": "assistant", "content": target},
                ],
                "meta": {"poem_id": poem["id"], "source": poem["source"], "k": k},
            }
        )
    return out


def _shuffle_key(e: dict) -> str:
    # deterministic per-example key: same corpus -> same order every rebuild
    return hashlib.sha1((e["meta"]["poem_id"] + str(e["meta"]["k"])).encode()).hexdigest()


def assemble_examples(poems, val_frac: float, gpc_ratio: float, max_ctx_lines: int):
    """Route poems into (train, val, summary) next-line examples. PURE — no I/O.

    Splits by poem (`poem_split`), keeps GPC padding out of val entirely, and
    subsamples GPC train examples to at most `gpc_ratio` x the core-train count
    so the modernist core stays dominant. The train list is deterministically
    shuffled by a sha1 of (poem_id, k). `main()` reads/writes around this; the
    tests exercise it directly (see tests/test_pipeline.py::TestAssembleExamples).
    """
    core_train, core_val, gpc_train = [], [], []
    stats = Counter()
    for poem in poems:
        split = poem_split(poem["id"], val_frac)
        exs = examples_for(poem, max_ctx_lines)
        is_gpc = str(poem["source"]).startswith("gpc")
        stats[f"poems::{split}"] += 1
        for e in exs:
            if is_gpc:
                # GPC never enters val (val should measure the real target genre)
                if split == "train":
                    gpc_train.append(e)
            elif split == "val":
                core_val.append(e)
            else:
                core_train.append(e)

    # subsample GPC to at most gpc-ratio of the core train examples
    cap = int(len(core_train) * gpc_ratio)
    if len(gpc_train) > cap:
        gpc_train.sort(key=_shuffle_key)
        gpc_train = gpc_train[:cap]

    train = core_train + gpc_train
    train.sort(key=_shuffle_key)  # shuffle-ish, deterministic

    summary = {
        "train_examples": len(train),
        "val_examples": len(core_val),
        "core_train": len(core_train),
        "gpc_train_used": len(gpc_train),
        "poems_train": stats["poems::train"],
        "poems_val": stats["poems::val"],
        "instruction": INSTRUCTION,
    }
    return train, core_val, summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--val-frac", type=float, default=0.05)
    ap.add_argument("--gpc-ratio", type=float, default=0.5,
                    help="max GPC examples as a fraction of non-GPC examples")
    ap.add_argument("--max-ctx-lines", type=int, default=24)
    args = ap.parse_args()

    if not POEMS.exists():
        print("run src.clean first", file=sys.stderr)
        sys.exit(1)

    train, val, summary = assemble_examples(
        read_jsonl(POEMS), args.val_frac, args.gpc_ratio, args.max_ctx_lines
    )

    write_jsonl(PROCESSED / "next_line.train.jsonl", train)
    write_jsonl(PROCESSED / "next_line.val.jsonl", val)
    (PROCESSED / "dataset_stats.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    print(f"\ntrain -> {PROCESSED/'next_line.train.jsonl'}\nval   -> {PROCESSED/'next_line.val.jsonl'}")


if __name__ == "__main__":
    main()

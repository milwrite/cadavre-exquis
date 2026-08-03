# Gold-line NLL — base vs tuned (gemma-4-E4B · exquisite-corpse)

400 held-out val examples · 3950 gold-line tokens · seed 11 · scored via the live vLLM host (echo+logprobs, teacher-forced on the gold next line).

Val set: `data/processed/next_line.val.jsonl` (9377 examples, sha256 481b0a3dd556). Reports against different fingerprints are **not comparable** — the corpus moves between runs.

| model | NLL/token | perplexity |
|---|---|---|
| base `unsloth/gemma-4-E4B-it` | 5.9244 | 374.05 |
| tuned `exquisite-corpse` | 3.6581 | 38.79 |

- Δ NLL/token (base − tuned): **2.2663** (tuned is e^Δ ≈ ×9.64 more likely per token)
- Per-example win rate (tuned assigns the gold line more total probability): **99.0%** of 400

Both models score the *same* rendered text with the *same* tokenizer;
only the LoRA weights differ, so the gap is attributable to the
fine-tune. Reproduce: `.venv/bin/python train/eval_nll.py --n 400 --seed 11`.

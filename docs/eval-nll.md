# Gold-line NLL — base vs tuned (gemma-4-E4B · exquisite-corpse)

400 held-out val examples · 4115 gold-line tokens · seed 11 · scored via the live vLLM host (echo+logprobs, teacher-forced on the gold next line).

| model | NLL/token | perplexity |
|---|---|---|
| base `unsloth/gemma-4-E4B-it` | 5.5106 | 247.29 |
| tuned `exquisite-corpse` | 3.4485 | 31.45 |

- Δ NLL/token (base − tuned): **2.0621** (tuned is e^Δ ≈ ×7.86 more likely per token)
- Per-example win rate (tuned assigns the gold line more total probability): **98.8%** of 400

Both models score the *same* rendered text with the *same* tokenizer;
only the LoRA weights differ, so the gap is attributable to the
fine-tune. Reproduce: `.venv/bin/python train/eval_nll.py --n 400 --seed 11`.

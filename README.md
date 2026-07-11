# Exquisite Corpse — surrealist corpus → Gemma QLoRA

Fine-tune a small Gemma to write surreal, modernist **next-line continuations**,
to feed the *Exquisite Corpse* game bot (deployed on `deepseek-v4-flash`).

**Live:** https://milwrite.github.io/cadavre-exquis/ is the canonical Pages
build, mirrored at https://inference-arcade.com/cadavre. The featured parlor and
the minimal [`/ui/corpse.html`](ui/corpse.html) surface offer the tuned Legion
adapter when it is reachable, followed by the models available to the Ollama
Cloud account. Remote play goes through the Inference Arcade proxy, which keeps
provider credentials on the server. `ui/config.local.js` remains the local
override for a direct vLLM or Ollama endpoint.

Pipeline: scrape public-domain modernist/imagist/surrealist verse → clean &
dedup → reshape into next-line chat examples → QLoRA a small Gemma with Unsloth.

## Layout
```
src/sources/     poetrydb.py, gutenberg.py, gutenberg_corpus.py   # fetch raw poems
src/clean.py     merge + clean + dedup + language filter  -> data/interim/poems.jsonl
src/build_dataset.py  next-line windowing + by-poem split -> data/processed/next_line.*.jsonl
train/train_qlora.py  Unsloth QLoRA (default unsloth/gemma-3-4b-it)
train/eval_compare.py base-vs-tuned next-line eval -> outputs/eval.md
deploy/build_ollama_model.py  wrap tuned GGUF + real corpse system prompt -> Ollama model
ui/corpse.html   intensely minimal play surface (caret = the poem's growing edge)
configs/gutenberg_volumes.json   curated modernist volumes (Gutendex-resolved)
PROGRESS.md      status ledger (source of truth)
CONTINUE.md      runbook for the scheduled continue-the-project agent
docs/superpowers/specs/   design spec
```

## Quickstart
```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m src.sources.poetrydb
.venv/bin/python -m src.sources.gutenberg
.venv/bin/python -m src.sources.gutenberg_corpus --max 15000
.venv/bin/python -m src.clean
.venv/bin/python -m src.build_dataset
# then, on a GPU box:
.venv/bin/pip install -r requirements-train.txt
MODEL=unsloth/gemma-3-4b-it .venv/bin/python train/train_qlora.py --epochs 2
```

## Current numbers
20,722 unique poems · 190,939 train / 7,290 val next-line examples. See
`data/processed/dataset_card.md`. Everything is public-domain or openly licensed.

## Design decisions
Aesthetic-first PD-heavy corpus; chat next-line objective with loss on the
assistant line only; by-poem split; GPC padding down-weighted. Full rationale in
the spec under `docs/superpowers/specs/`.

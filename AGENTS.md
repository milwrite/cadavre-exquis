# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

A data-and-training pipeline that fine-tunes a small Gemma (QLoRA, via Unsloth) to write
surreal/modernist **next-line poem continuations**, feeding an "Exquisite Corpse" game bot
deployed on `deepseek-v4-flash`. The flow: scrape public-domain verse → clean/dedup → reshape
into next-line chat examples → QLoRA a small Gemma → (optional) GGUF export → Ollama model
that a minimal browser UI plays against.

`PROGRESS.md` is the **single source of truth** for what is done and what is next — read it
first. Keep it honest: no checkbox ticked without evidence. `CONTINUE.md` is the runbook for
an unattended cron agent that advances the project one verified step per run. Full rationale
lives in `docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

## Commands

```bash
# venv is Python 3.12 at .venv/bin/python (scrape deps in requirements.txt)
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Data pipeline, in order. Each fetcher is resumable/checkpointed.
.venv/bin/python -m src.sources.poetrydb              # -> data/raw/poetrydb.jsonl
.venv/bin/python -m src.sources.gutenberg             # -> data/raw/gutenberg.jsonl (curated volumes)
.venv/bin/python -m src.sources.gutenberg_corpus --max 15000   # -> data/raw/gpc.jsonl (padding)
.venv/bin/python -m src.clean                         # merge/dedup -> data/interim/poems.jsonl
.venv/bin/python -m src.build_dataset                 # -> data/processed/next_line.{train,val}.jsonl

# Training (heavy deps, GPU box only — install separately, NOT part of base setup)
.venv/bin/pip install -r requirements-train.txt
MODEL=unsloth/gemma-3-4b-it .venv/bin/python train/train_qlora.py --epochs 2
.venv/bin/python train/train_qlora.py --max-steps 30  # smoke test (cap steps)

# Eval, deploy, play
.venv/bin/python train/eval_compare.py --n 12         # base-vs-tuned -> outputs/eval.md
GGUF=1 .venv/bin/python train/train_qlora.py          # also export q4_k_m GGUF
.venv/bin/python deploy/build_ollama_model.py --create  # wrap GGUF + system prompt into Ollama
cp ui/config.example.js ui/config.local.js && ./ui/serve.sh  # play UI at localhost:8800
```

There is no test suite, linter, or build step — verification is running a pipeline stage and
checking its printed counts, or `eval_compare.py` for model quality.

### Env vars (training/eval)
`MODEL`, `MAX_SEQ_LEN` (train_qlora); `GGUF=1` (export for Ollama); `PUSH_REPO=milwright/...`
(push adapter to HF, private); `LORA_DIR`, `MAX_NEW_TOKENS` (eval_compare).

## Architecture

**Everything is JSON Lines, and the common unit is a poem record** (defined in `src/common.py`):
`{source, title, author, year, lines[], meta{}}`, where `lines` uses `""` to mark a
stanza/blank-line break. Cleaning adds `id, n_lines, char_len, lang`. Stages are decoupled by
these files under `data/{raw,interim,processed}/` — a stage only reads the previous stage's output.

Pipeline stages and what each enforces:
- **`src/sources/*.py`** — one fetcher per source, each emitting raw poem records.
  `poetrydb` (canon, already line-split), `gutenberg` (curated modernist volumes resolved via
  the Gutendex API, boilerplate-stripped, heuristically segmented into poems), `gutenberg_corpus`
  (Allison Parrish's GPC — 3M PD lines chunked into pseudo-poems; **padding/breadth only**,
  down-weighted later). Fetchers cache/checkpoint so re-runs skip finished work.
- **`src/clean.py`** — merges all `data/raw/*.jsonl`, filters (3–200 non-blank lines, English or
  undetermined, not prose), and dedups by normalized-content hash. `SOURCE_PRIORITY` decides which
  source wins a duplicate (clean sources beat GPC padding).
- **`src/build_dataset.py`** — windows each poem into next-line examples: user = INSTRUCTION +
  lines so far, assistant = the next line. Key invariants:
  - Messages are stored **structurally (role/content) and model-agnostic** — the Gemma chat
    template is applied at *train* time, never baked in here.
  - Split is **by poem** (95/5) so no poem's lines leak across train/val.
  - GPC is subsampled to `--gpc-ratio` of the core and **never enters val** (val measures the
    real target genre).
- **`train/train_qlora.py`** — Unsloth QLoRA. Applies `gemma-3` chat template and uses
  `train_on_responses_only` so **loss is masked to the assistant (next-line) tokens** — the model
  learns continuation, not instruction boilerplate. Heavy imports (unsloth/torch/trl) are *inside
  `main()`* so the file reads without a GPU env installed.
- **`deploy/build_ollama_model.py`** — wraps the tuned GGUF with the real game system prompt read
  from the Open WebUI export (`exquisite-corpse-*.json`); that JSON stays the single source of
  truth for the prompt, never forked.
- **`ui/corpse.html`** — minimal play surface; `index.html` is the featured GitHub Pages landing.
  Config (endpoint/model/apiKey) comes from gitignored `ui/config.local.js`.

## Conventions and constraints

- **After changing any source, always re-run `src.clean` then `src.build_dataset`** — the
  downstream files are stale otherwise. This is the single easiest thing to forget.
- **Data files are gitignored and regenerable** (`data/raw|interim|processed/*.jsonl`, `*.gz`,
  `outputs/`); only the small summaries `dataset_stats.json` and `dataset_card.md` are tracked.
  Don't commit corpus data, and don't delete/force-refresh `data/` without reason.
- **Corpus scope is locked: public-domain / openly-licensed only.** Do NOT add scrapers for
  copyright-restricted sites (Poetry Foundation, poets.org) — explicitly out of scope.
- **Never bake a chat template into the dataset** — keep it model-agnostic; templating is a
  train-time concern.
- **Secrets:** the browser API key lives only in gitignored `ui/config.local.js`; model exports
  were PII-scrubbed before the first public push. Keep it that way.
- Local dev path is `/Users/zacharymuhlbauer/dev/cadavre-exquis`; `CONTINUE.md`/`scripts/continue.sh`
  reference `/home/milwrite/exquisite-corpse` — that's the GPU box (RTX 5090) where training runs.
- Git commits: detailed but ≤100 chars, all lowercase. Never add a co-author sign-off.

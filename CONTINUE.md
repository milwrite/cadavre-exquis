# CONTINUE — runbook for the scheduled "continue the project" agent

You are resuming an in-flight project in a **fresh session**. Work in
`/home/milwrite/exquisite-corpse`. Be incremental and idempotent: advance the
project by **one meaningful step**, verify it, update `PROGRESS.md`, commit,
and stop. Do not restart from scratch. Do not re-download what already exists.

## 1. Orient (always do this first)
```bash
cd /home/milwrite/exquisite-corpse
cat PROGRESS.md                      # what's done / what's next / follow-ups
for f in data/raw/*.jsonl; do printf "%-28s " "$f"; wc -l < "$f"; done
wc -l data/interim/poems.jsonl data/processed/next_line.*.jsonl 2>/dev/null
git log --oneline -5
nvidia-smi -L
```
The **first unchecked `[ ]` box in PROGRESS.md is your task.** If all data boxes
are checked, pick the highest-value item from "Known follow-ups".

## 2. Environment
- venv: `.venv/bin/python` (Python 3.12). Scrape deps already installed.
- Training deps are heavy and NOT installed until the train step:
  `.venv/bin/pip install -r requirements-train.txt`.
- Sources are resumable: re-running a `src.sources.*` fetcher skips finished work.

## 3. Pipeline commands (in order)
```bash
.venv/bin/python -m src.sources.poetrydb            # refresh source (resumable)
.venv/bin/python -m src.sources.gutenberg           # refresh source (resumable)
.venv/bin/python -m src.sources.gutenberg_corpus --max 15000
.venv/bin/python -m src.clean                       # -> data/interim/poems.jsonl
.venv/bin/python -m src.build_dataset               # -> data/processed/next_line.*.jsonl
```
**Always re-run `src.clean` then `src.build_dataset` after any source changes.**

## 4. Good next steps if data is done
- **Train (needs GPU + train deps):** `MODEL=unsloth/gemma-3-4b-it .venv/bin/python train/train_qlora.py --epochs 2`
  then write a base-vs-tuned comparison on 10 held-out `val` prefixes to `outputs/eval.md`.
- **Quality follow-ups** (see PROGRESS.md "Known follow-ups"): recover missed
  volumes, fix Spoon-River-style under-segmentation, rebalance `--gpc-ratio`.
- Long jobs (training, big downloads): run in the background and stop; the next
  scheduled run checks the result.

## 5. Finish every run
1. Update `PROGRESS.md`: tick completed boxes, update the counts table, note
   anything you changed or discovered.
2. `git add -A && git commit -m "continue: <what you did>"`.
3. Stop. One solid, verified step per run beats a sprawling half-finished one.

## Guardrails
- Only public-domain / openly-licensed text. Don't add scrapers for
  copyright-restricted sites (Poetry Foundation, poets.org) — that was
  explicitly out of scope (aesthetic-first, PD-heavy).
- Don't delete `data/` or force-refresh sources without reason (wastes bandwidth).
- Keep the dataset model-agnostic; don't bake in a chat template at build time.

# PROGRESS — Surrealist corpus → Gemma QLoRA

**Owner:** Zach Muhlbauer (CUNY GC) · **Goal:** fine-tune a small Gemma to write
surreal next-line continuations, feeding the "Exquisite Corpse" game bot
(deployed on `gemma-4-31b-it`). Spec: `docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

This file is the **single source of truth for what is done and what is next.**
The cron agent (see `CONTINUE.md`) reads it, advances the next unchecked item,
updates counts, and commits. Keep it honest — no checkbox ticked without evidence.

## Decisions (locked)
- Corpus: aesthetic-first, public-domain-heavy. Surrealist core + modernist breadth.
- Objective: **chat next-line continuation**, model-agnostic messages, loss on assistant only.
- Local train target: **`unsloth/gemma-3-4b-it`** (smallest sensible; no Gemma-4 < 12B exists).
  Recipe transfers to `google/gemma-4-12B-it` then the deployed 31B later.
- Split by poem 95/5. GPC padding down-weighted; never in val.

## Automation
- [x] **Scheduled continuation** — `scripts/continue.sh` via crontab, **daily 09:00**.
  Runs headless Claude Code against `CONTINUE.md`, advances one step, commits.
  Disable: `crontab -e` → delete the `exquisite-corpse` lines. Log: `logs/cron.log`.

## Pipeline status
- [x] **Scaffold + venv + git** — `.venv` (py3.12), package `src/`.
- [x] **Source: PoetryDB** — `data/raw/poetrydb.jsonl` (~3k target; check count).
- [x] **Source: Gutenberg volumes** — `data/raw/gutenberg.jsonl` = **2439 poems**.
- [x] **Source: Gutenberg Poetry Corpus** — `data/raw/gpc.jsonl` = **15000 pseudo-poems**.
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **19,061 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **156,271 / 6,109 examples**.
- [x] **≥10,000 unique poems confirmed** — 19,061 (target exceeded).
- [x] **Dataset card** — `data/processed/dataset_card.md` written.
- [ ] **Install train deps** — `.venv/bin/pip install -r requirements-train.txt` (on GPU box). NEXT.
- [ ] **Train QLoRA** — `python train/train_qlora.py` → `outputs/lora`.
- [ ] **Qualitative eval** — base vs tuned on 10 held-out prefixes; save to `outputs/eval.md`.
- [ ] **(opt) GGUF export** for Ollama/Open WebUI — `GGUF=1 python train/train_qlora.py`.
- [ ] **(opt) Push private HF dataset** under `milwright/`.

## Counts (update each run)
| source | raw records | kept after clean |
|---|---|---|
| poetrydb | 2526 | 2295 |
| gutenberg volumes | 2439 | 2111 |
| gpc (padding) | 15000 | 14655 |
| **unique poems after clean** | | **19061** |
| **train / val examples** | | **156271 / 6109** |

Core (surreal/modernist) = poetrydb + gutenberg = **4406** poems; GPC is padding.

## Known follow-ups (cron can pick these up to improve quality)
1. **Recover missed volumes** — Untermeyer *Modern American/British Poetry*,
   Monroe *The New Poetry*, Sandburg (*Chicago Poems* etc.), Aiken, Kreymborg
   *Others* missed via Gutendex author filter. Refine `resolve_book` (check >1
   page of results; relax author match) or add explicit ebook IDs to
   `configs/gutenberg_volumes.json`.
2. **Better segmentation** — Spoon River (240 epitaphs → only 3) and other
   single-blank-line volumes are under-split. Add a per-volume segmentation hint
   (split on single blank when 3-blank yields <5 chunks) in `src/sources/gutenberg.py`.
3. **Genre balance** — after clean, report share of surreal/proto-language tags;
   if GPC dominates, lower `--gpc-ratio` in build_dataset.
4. **Surrealist depth** — add PD translations (Rimbaud/Lautréamont/Apollinaire)
   from Wikisource/Archive.org if licensing checks out.

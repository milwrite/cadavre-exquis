# PROGRESS — Surrealist corpus → Gemma QLoRA

**Owner:** Zach Muhlbauer (CUNY GC) · **Goal:** fine-tune a small Gemma to write
surreal next-line continuations, feeding the "Exquisite Corpse" game bot
(deployed on `deepseek-v4-flash`). Spec: `docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

This file is the **single source of truth for what is done and what is next.**
The cron agent (see `CONTINUE.md`) reads it, advances the next unchecked item,
updates counts, and commits. Keep it honest — no checkbox ticked without evidence.

## Decisions (locked)
- Corpus: aesthetic-first, public-domain-heavy. Surrealist core + modernist breadth.
- Objective: **chat next-line continuation**, model-agnostic messages, loss on assistant only.
- Local train target: **`unsloth/gemma-3-4b-it`** (smallest sensible; no Gemma-4 < 12B exists).
  Recipe can transfer to `google/gemma-4-12B-it` / a larger hosted model later.
- Split by poem 95/5. GPC padding down-weighted; never in val.

## Published
- **Repo:** https://github.com/milwrite/cadavre-exquis (public, branch `master`)
- **Pages:** https://milwrite.github.io/cadavre-exquis/ (serves `index.html`,
  "the parlor"; minimal solo UI at `/ui/corpse.html`, "the open sheet")
- Model export PII scrubbed before first push; API key stays in gitignored `ui/config.local.js`.
- **2026-07-09 UX audit:** both UIs unified on the ink/bone identity and one
  config contract (defaults → `config.local.js` → URL params); the parlor now
  actually folds contributions out of sight during play, reveals locally, and
  has a viewable wall; error paths all have retry. Verified end-to-end in-browser
  against the live vLLM adapter.

## Automation
- [x] **Scheduled continuation** — `scripts/continue.sh` via crontab, **daily 12:00 (noon)**.
  Runs headless Claude Code against `CONTINUE.md`, advances one step, commits.
  Disable: `crontab -e` → delete the `exquisite-corpse` lines. Log: `logs/cron.log`.

## Pipeline status
- [x] **Scaffold + venv + git** — `.venv` (py3.12), package `src/`.
- [x] **Source: PoetryDB** — `data/raw/poetrydb.jsonl` (~3k target; check count).
- [x] **Source: Gutenberg volumes** — `data/raw/gutenberg.jsonl` = **2439 poems**.
- [x] **Source: Gutenberg Poetry Corpus** — `data/raw/gpc.jsonl` = **15000 pseudo-poems**.
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **21,446 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **215,577 / 8,106 examples**.
- [x] **≥10,000 unique poems confirmed** — 21,446 (target exceeded).
- [x] **Dataset card** — `data/processed/dataset_card.md` written.
- [x] **Install train deps** — done; verified **torch 2.10.0+cu128, CUDA True, RTX 5090**.
- [x] **Train QLoRA** — trained on **`unsloth/gemma-4-E4B-it`** (on-stock vLLM base),
      2500 steps, `train_loss 0.81` → `outputs/lora` (r=16). Markers auto-detected.
- [x] **Integrated into vLLM** — `scripts/vllm_serve.sh` serves base + 3 adapters
      (`cloze-reader`, `jeopardylm`, **`exquisite-corpse`**) on :1234; smoke-tested.
      UI (`ui/config.local.js`) points at it. Needs `VLLM_USE_FLASHINFER_SAMPLER=0`.
- [x] **Qualitative eval** — `train/eval_vllm.py` (base vs tuned via the live vLLM
      host, no GPU reload) → `docs/eval-e4b.md`, 12 held-out prefixes.
- [x] **Pushed adapter to HF** — https://huggingface.co/milwright/exquisite-corpse-gemma-4-e4b-lora
      (public); uncommented in `../cloze-reader-monorepo/finetune/deploy/serve_gemma.sh`.
- [ ] **(opt) GGUF export** — `GGUF=1 .venv/bin/python train/train_qlora.py`.
- [ ] **(opt) Ollama model** — `.venv/bin/python deploy/build_ollama_model.py --create`
      (wraps GGUF with the real Exquisite Corpse system prompt).
- [ ] **(opt) Push private HF dataset** under `milwright/`.

## Counts (update each run)
| source | raw records | kept after clean |
|---|---|---|
| poetrydb | 2526 | 2295 |
| gutenberg volumes | 5172 | 4499 |
| gpc (padding) | 15000 | 14652 |
| **unique poems after clean** | | **21446** |
| **train / val examples** | | **215577 / 8106** |

Core (surreal/modernist) = poetrydb + gutenberg = **6794** poems; GPC is padding.

## Known follow-ups (cron can pick these up to improve quality)
1. ~~Recover missed volumes~~ **DONE** — `resolve_book` now searches title+author,
   paginates 3 pages, matches on last name, and supports explicit `gid`. Volume
   list expanded (Millay, Teasdale, Lawrence, McKay, Frost, Owen, Hopkins, +anthologies).
2. ~~Better segmentation~~ **DONE** — `segment_poems` falls back from 3-blank to
   2-blank split when the coarse split is too few/too-lumpy (fixes Spoon River etc.).
3. ~~Genre balance~~ **DONE** — `src.report_balance` reports the core-vs-GPC
   split (the **source family** is the genre proxy; there is no separate tag
   field). GPC is 70.7% of *poems* but, after the `--gpc-ratio 0.5` cap, only
   **33.3% of train examples** (core leads 2:1) — the cap already keeps the
   modernist core ahead, so **no rebalance needed** (and lowering it now would
   desync `data/processed` from the shipped adapter). Full table +
   per-ratio preview: `docs/genre-balance.md`. Re-run:
   `.venv/bin/python -m src.report_balance --write-md`.
4. ~~Surrealist depth~~ **PARTLY DONE (2026-07-12)** — added the English-PD
   **symbolist → decadent lineage** (the direct ancestors of surrealism) via the
   existing curated Gutenberg list (licensing-safe: all PG text is US public
   domain, so no new scraper / no Wikisource copyright audit): Baudelaire
   *Flowers of Evil* + *Prose and Poetry* [36098/47032], Verlaine [8426], Symons
   *Symbolist Movement* + *Silhouettes* [53849/29531], Dowson [8497], Swinburne
   *Poems and Ballads* [18726] → **761** new-lineage poems in the clean corpus
   (+727 gutenberg kept; +24.6k train examples). Rimbaud/Lautréamont/Apollinaire
   are **not achievable via Gutenberg** — Maldoror [12005], Alcools [15462] and
   Calligrammes [55569] exist there only in **French** (the `en`-only filter
   correctly rejects them); PD *English* translations would need Wikisource/
   Archive.org vetting, deferred.
5. **Stale miss-cache** (discovered 2026-07-12) — `data/raw/.volume_cache/resolve.json`
   caches misses permanently, so several config volumes never landed and won't
   retry even after the resolver improved: Rimbaud *Illuminations*/*A Season in
   Hell*, Cummings *Tulips and Chimneys*, Sandburg *Chicago/Cornhuskers/Smoke and
   Steel*, Bogan, et al. (see `logs/gutenberg_extend.log`). The corpus lacks
   Rimbaud in English despite the config listing it. Fix: prune known-good titles
   from the miss cache (or add `gid` pins) and re-run `src.sources.gutenberg`.
6. **Title-page front-matter** (discovered 2026-07-12) — `segment_poems` keeps the
   first chunk of a volume even when it's a title page (e.g. "THE FLOWERS OF EVIL
   / by / CHARLES BAUDELAIRE"); ~1 junk record per volume. Extend the `_JUNK`
   regex / add an all-caps+short-body guard, then rerun clean+build.

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
- Model export PII scrubbed before first push. Published provider credentials stay
  in the Inference Arcade Railway environment; `ui/config.local.js` remains the
  gitignored override for personal endpoints.
- **2026-07-09 UX audit:** both UIs unified on the ink/bone identity and one
  config contract (defaults → `config.local.js` → URL params); the parlor now
  actually folds contributions out of sight during play, reveals locally, and
  has a viewable wall; error paths all have retry. Verified end-to-end in-browser
  against the live vLLM adapter.
- **2026-07-11 hosted routing:** GitHub Pages and
  https://inference-arcade.com/cadavre now use the same canonical interfaces.
  Both load the server-owned `/api/cadavre/models` catalog and send route ids to
  `/api/cadavre/chat`; a live check returned 34 Ollama Cloud choices and completed
  a `gemma3:4b` turn. Railway's `OLLAMA_API_KEY` matches the supplied environment
  value. The Legion choice stays disabled until Railway can reach its HTTPS vLLM
  endpoint.

## Automation
- [x] **Scheduled continuation** — `scripts/continue.sh` via crontab, **daily 12:00 (noon)**.
  Runs headless Claude Code against `CONTINUE.md`, advances one step, commits.
  Disable: `crontab -e` → delete the `exquisite-corpse` lines. Log: `logs/cron.log`.

## Pipeline status
- [x] **Scaffold + venv + git** — `.venv` (py3.12), package `src/`.
- [x] **Source: PoetryDB** — `data/raw/poetrydb.jsonl` (~3k target; check count).
- [x] **Source: Gutenberg volumes** — `data/raw/gutenberg.jsonl` = **2439 poems**.
- [x] **Source: Gutenberg Poetry Corpus** — `data/raw/gpc.jsonl` = **15000 pseudo-poems**.
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **20,722 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **190,939 / 7,290 examples**.
- [x] **≥10,000 unique poems confirmed** — 20,722 (target exceeded).
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
| gutenberg volumes | 4360 | 3772 |
| gpc (padding) | 15000 | 14655 |
| **unique poems after clean** | | **20722** |
| **train / val examples** | | **190939 / 7290** |

Core (surreal/modernist) = poetrydb + gutenberg = **6067** poems; GPC is padding.

## Known follow-ups (cron can pick these up to improve quality)
1. ~~Recover missed volumes~~ **DONE** — `resolve_book` now searches title+author,
   paginates 3 pages, matches on last name, and supports explicit `gid`. Volume
   list expanded (Millay, Teasdale, Lawrence, McKay, Frost, Owen, Hopkins, +anthologies).
2. ~~Better segmentation~~ **DONE** — `segment_poems` falls back from 3-blank to
   2-blank split when the coarse split is too few/too-lumpy (fixes Spoon River etc.).
3. **Genre balance** — after clean, report share of surreal/proto-language tags;
   if GPC dominates, lower `--gpc-ratio` in build_dataset.
4. **Surrealist depth** — add PD translations (Rimbaud/Lautréamont/Apollinaire)
   from Wikisource/Archive.org if licensing checks out.
5. **Legion remote route** — publish the Gemma-4 E4B vLLM host at an HTTPS URL
   Railway can reach, then set `LEGION_VLLM_URL`. The catalog enables
   `legion:exquisite-corpse` after `/v1/models` lists the adapter.

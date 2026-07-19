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
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **21,744 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **228,876 / 8,294 examples**.
- [x] **≥10,000 unique poems confirmed** — 21,744 (target exceeded).
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
- [x] **(opt) GGUF export** (2026-07-17) — exported the **shipped** adapter
      (`outputs/lora`, the 2500-step one on HF/vLLM) to a GGUF **LoRA adapter**
      → `outputs/gguf/exquisite-corpse-lora-bf16.gguf` (gitignored, 73.4 MB, 588
      tensors) via new `deploy/export_gguf.py`. Verified with `GGUFReader`:
      `general.type=adapter`, `adapter.type=lora`, `general.architecture=gemma4`,
      **`adapter.lora.alpha=16`** (matches the trained config → byte-consistent
      with production). Reproduce: `.venv/bin/python deploy/export_gguf.py`.
      **Not** `GGUF=1 train_qlora.py`: that path `trainer.train()`s first, so it
      retrains from scratch (`--epochs 2` ≈ 28k steps) and would ship a *different*
      adapter than production. Why an *adapter* GGUF, not a merged model: the E4B
      base's projections are `Gemma4ClippableLinear` (elastic-MatFormer) — `peft`
      refuses to merge a LoRA onto that custom class, the reliable Unsloth merge
      needs exclusive GPU (held by the live vLLM host, ~3 GB free), and no
      `llama-export-lora` binary / base GGUF is on hand to merge at the GGUF level.
      llama.cpp's `convert_lora_to_gguf.py` reads the adapter safetensors and
      remaps names by string, so it converts cleanly on **CPU** with vLLM still up.
- [x] **(opt) Ollama model** — **BLOCKER RESOLVED & VERIFIED on Ollama 0.31.1
      (2026-07-19).** The 2026-07-18 block was: on Ollama **0.24.0**, gemma-4 E4B ran
      on Ollama's **native engine** (not the llama.cpp runner), which didn't implement
      LoRA `ADAPTER` layers — `ollama create` succeeded but `ollama run` died at init
      with `500 … loras are not yet implemented`. That was path (b): "upgrade past
      0.24.0". **A 0.31.1 build is now installed at `/usr/local/bin/ollama`**, and it
      runs gemma-4 through the **llama.cpp `llama-server` runner** (`--lora …`), which
      supports LoRA. Verified end-to-end, non-destructively (isolated 0.31.1 server on
      alt port 11666, own model store with base blobs copied read-only from the snap
      store, CPU-only — the production snap 0.24.0 daemon, the cloze-reader shim, and
      the GPU/vLLM were untouched): `ollama create` (exit 0) → `run`/`generate`
      **succeeds** (no "loras" error); runner logs `llama_adapter_lora_init_impl:
      loading lora adapter … general.architecture=gemma4, adapter.type=lora,
      adapter.lora.alpha=16.0` (matches the trained config); and greedy (temp 0) output
      **diverges** from the base on the same prompt (base emits nothing; tuned →
      *"clock face, dripping down to the floor. The hands were still stuck at 10:15…"*),
      proving the adapter is genuinely applied, not silently dropped. Full evidence +
      reproduction: **`docs/ollama-lora-verified.md`**.
      **Remaining is one operational (not code/data) step, left to the operator** — the
      *default-port* server is still the snap **0.24.0** build (it holds :11434, so the
      `ollama.service` systemd unit for the 0.31.1 binary is stuck auto-restarting).
      Switching the active runtime affects other Ollama consumers on this box
      (cloze-reader shim, `cpt-qwen`, gemma3 models), so it isn't done autonomously in
      a cron step: `sudo snap disable ollama && sudo systemctl restart ollama`, then
      `.venv/bin/python deploy/build_ollama_model.py --base gemma4:e4b --create`
      (adds the corpse SYSTEM prompt) → `ollama run exquisite-corpse-tuned`. Superseded
      paths: (a) merge the LoRA into a single model GGUF — no longer needed now that the
      llama.cpp runner applies the adapter directly; (c) the tuned adapter is also
      served by the multi-LoRA **vLLM** host on :1234 (`exquisite-corpse`), which the
      UIs point at — Ollama is a (now-working) convenience alternative.
      **Fixed earlier (still current):** `build_ollama_model.py` resolves the ADAPTER
      path relative to the **Modelfile's** dir via `os.path.relpath(gguf,
      Modelfile.parent)` → `../outputs/…`; `deploy/Modelfile` is gitignored (generated).
- [x] **(opt) Push private HF dataset** (2026-07-16) — **private** repo
      https://huggingface.co/datasets/milwright/exquisite-corpse-next-line
      (`next_line.{train,val}.jsonl` byte-exact, `dataset_stats.json`, and the
      card as `README.md` with viewer-config frontmatter → train/validation
      splits). Reproducible via `deploy/push_hf_dataset.sh` (idempotent, re-asserts
      private). Refreshed `data/processed/dataset_card.md` counts first — they
      were stale from before follow-up #5 (21,446→**21,744** poems,
      215,577→**228,876** train, +the 4 recovered volumes). Verified
      `private: true` + file sizes via `hf datasets info`.

## Counts (update each run)
| source | raw records | kept after clean |
|---|---|---|
| poetrydb | 2526 | 2295 |
| gutenberg volumes | 5489 | 4797 |
| gpc (padding) | 15000 | 14652 |
| **unique poems after clean** | | **21744** |
| **train / val examples** | | **228876 / 8294** |

Core (surreal/modernist) = poetrydb + gutenberg = **7092** poems; GPC is padding.

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
5. ~~Stale miss-cache~~ **DONE (2026-07-15)** — root-caused and fixed. Two bugs
   compounded: (a) the resolver cached `None` misses permanently
   (`if key in resolve_cache` short-circuited before any retry), and (b) Gutendex's
   `search=` endpoint is intermittently flaky here (some queries hang to timeout,
   others return `count=0`), so many "misses" were **false**. Fix: a pinned `gid`
   now **bypasses the cache** and resolves via the reliable `ids=` short-circuit
   (`src/sources/gutenberg.py`), making recovery deterministic regardless of search
   flakiness. **Evidence corrects the original premise** — most listed titles are
   *genuinely absent* from Project Gutenberg: Sandburg (only *Rootabaga* children's
   prose is there), E. E. Cummings (every "Cummings" hit is *Ray* Cummings pulp SF),
   Aiken's three requested titles, and the Untermeyer/Monroe anthologies (resolve to
   different same-named authors), plus Rimbaud in English. **Recovered 4 verified,
   gid-pinned volumes (+307 poems → 21,744; +13.3k train → 228,876):** *The Book of
   American Negro Poetry* [11986] (James Weldon Johnson, ed. — flagship
   Harlem-Renaissance anthology; had *also* failed the resolver's last-name filter
   because PG lists no author for it), Aiken *The House of Dust* [1246], Untermeyer
   *Challenge* [34001], Amy Lowell *A Dome of Many-Coloured Glass* [261] — the latter
   three fulfil the config's Aiken/Untermeyer/Lowell curatorial intent whose
   *requested* titles are absent. Minor: a couple of bare title-page fragments leaked
   in (no imprint signal for `is_front_matter()`; see #6's accepted limitation).
   Left cached as misses (fast-skip, avoids the flaky search): Sandburg, Cummings,
   Rimbaud EN, Rilke *Book of Images*, the Untermeyer/Monroe/Kreymborg anthologies.
6. ~~Title-page front-matter~~ **DONE (2026-07-13)** — added `is_front_matter()`
   to `src/common.py`, wired into `src.clean` (drops at merge, so it catches every
   source and needs no network re-fetch). It flags a chunk of ≤8 non-blank lines
   carrying **≥2 distinct publisher/printer imprint signals** (imprint place /
   publisher name / bare year / street address) — high precision so real short
   all-caps poems survive (validated: Stein's *Tender Buttons*, Pound's chess poem
   kept). Removed **9** colophon/imprint records (Boni, Houghton Mifflin ×2,
   Four Seas, Egoist Press, Dutton, Riverside Press, a Lawrence bibliography, the
   Baudelaire title page): 21,446 → **21,437** poems, 215,577 → **215,533** train
   examples. Chose the clean stage over `segment_poems` because the pattern is
   source-agnostic and `_JUNK` (which keys on CONTENTS/PREFACE/etc.) can't see
   imprints. Regex note: each alternative carries its own `\b` — a group-level
   `\b(…|&\s?CO|…)\b` silently kills every `&`-prefixed alternative.
   Not addressed: bare title-page fragments with no imprint signal (e.g. "CANZONI
   / TO / OLIVIA…" dedications) are left in — erring toward keeping avoids eating
   real poems; extend the signal set later if they prove noisy.

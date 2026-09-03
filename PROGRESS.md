# PROGRESS — Surrealist corpus → Gemma QLoRA

**Owner:** Zach Muhlbauer (CUNY GC) · **Goal:** fine-tune a small Gemma to write
surreal next-line continuations, feeding the "Exquisite Corpse" game bot
(served through a readiness-checked, multi-provider model pool). Spec:
`docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

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
- **2026-07-13 shared wall pages and voting:** wall poems show 20 lines per
  numbered page, and upvotes and downvotes persist in Railway Postgres through
  the application API. A 45-line live test covered three pages, vote changes,
  reload persistence, and clearing a vote. The temporary post was removed, and
  both public pages returned to the three real entries without console errors.
- **2026-07-13 model readiness and failover (refreshed 2026-07-27):** published
  play waits for a real generated readiness response before accepting the first
  turn. The server now defaults to the currently listed `kimi-k2.5`, adopts
  catalog replacements for retired model ids, and moves through verified
  `minimax-m3`, `deepseek-v4-flash`, and `gpt-oss:20b` standbys. OpenRouter is
  removed from the advertised pool while its key has no remaining capacity,
  and a bounded Cadavre-only Ollama reserve cannot be consumed by tournaments
  or background warmups. Both UIs retry transient turns automatically and
  adopt the effective route returned by the server.
- **2026-09-02 CAIL Gateway relay:** `ui/cail_proxy.py` + `ui/serve-cail.sh`
  serve both pages locally through the CUNY AI Lab Gateway (Cloudflare AI
  Gateway) with a personal `sk-cail-*` key held server-side; the gateway sends
  no CORS preflight and rejects `Python-urllib` (error 1010). The relay maps
  `/v1/models` (264 routes: 31 Workers AI, 233 OpenRouter) to the page catalog,
  refuses any model outside it, verifies readiness with one tiny generation,
  and switches thinking off for reasoning models. Verified: models, ready, and
  chat via `@cf/google/gemma-4-26b-a4b-it` and `deepseek/deepseek-chat-v3.1`.
- **2026-09-02 Cloudflare Worker on the CUNY AI Lab account:** `worker/` ships the
  game as one self-contained Worker, `cail-cadavre`, at
  https://cail-cadavre.ailab-452.workers.dev (workers.dev trigger only; nothing
  else on the account touched). Both pages are static assets; `/api/cadavre/*`
  runs `@cf/` routes on the account's own Workers AI binding (no provider key),
  draws its menu from the gateway's public catalog, clamps budgets (400 tokens,
  12 messages), rate-limits by IP (20 turns / 6 readings / 5 pins per minute),
  and keeps a daily token ceiling plus the shared wall in one SQLite Durable
  Object. A one-fold probe of all 24 listed Workers AI routes excluded nine
  (hidden or leaked reasoning, one license-gated vision model); 15 remain,
  default Gemma 4 26B. Verified live: readiness, a fold, wall pin/vote/remove,
  and full browser rounds with close readings on Gemma 4 and Llama 3.3 70B.
  Page fixes shipped with it: the parlor's other hand is now a catalog menu,
  and the intro column stays pinned at the top instead of centring itself
  halfway down a long reveal. On middle-sized screens (48–80rem) the reveal
  collapses the intro to its title line and gives the poem the whole width,
  with the close reading beside it from 60rem up.
  Next folds: Turnstile sessions, the lab's front-door ruling, a delegated name.

## 2026-09-02 · the parlor as one column, the wall on its own page
- `index.html` redesigned: masthead with the epigraph on one unbroken line, a short
  intro, then table → sheet → reveal in a single 42rem column (the reveal widens to
  poem-left / reading-right from 60rem). Verse is flush left at 1.15–1.3rem; the
  close reading sits beside it without a box. One serif, no mono chrome, no caps
  eyebrows. Phone, tablet, and desk widths rendered and checked.
- The wall moved to `wall.html` (paging, votes, unpin). The parlor previews the six
  newest pins at five lines each and links to `wall.html#pin-<id>`; pinning stays on
  the page and reports "pinned to the wall" with a link.
- Worker: `wall.html` in `dist/`, default model `@cf/deepseek-ai/deepseek-v4-flash-0731`
  (also first in the offline fallback catalog). Deployed to
  https://cail-cadavre.ailab-452.workers.dev. Same design ported to the
  inference-arcade fork (`gvgai-web` `web/public/cadavre.html` + `cadavre-wall.html`),
  whose server default is now `ollama:deepseek-v4-flash`.
- "The Wall" is set in the title's cut-out print: `assets/title-wall-1.png` (678×168 at
  1x, rendered 2x from an HTML collage of Rockwell, Helvetica Neue Light, Didot, Bodoni 72,
  American Typewriter, Futura, and Baskerville Italic on tinted scraps), shown at 15.6rem so
  its scraps match the title's scale; used as the wall heading on both pages and on the fork.
- Second pass on the same day: the wall sits further below the game under a 9.5rem heading
  (11rem on its own page); controls read `submit` and `redo turn | clear lines | reveal poem`;
  chrome (labels, status, buttons, selects, footer) is a system sans while verse, intro, and
  reading stay serif; buttons are filled wine (primary), wine-outlined (reveal), or bone-edged.
  The model's line never lands inside 3 s (`MODEL_MIN_WAIT_MS`) so a hand can reveal on its
  own turn, and the play prompt carries a SHAPE note keyed to the fold count (opening → shaping
  → offering a close after 8 folds). The footer's connection line is gone.
- The wall page is one card per corpse: the whole poem (never paged) centred in the left
  third, its close reading always open in the right two-thirds, name/date/votes on a strip
  below; stacked single-file, poem above reading under 56rem. The Worker gained
  `POST /api/cadavre/wall/:id/rename` (delete token + name) and the wall page a "rename"
  control for pins this browser made; the inference-arcade fork has the cards but no rename.
- The sheet is flush left at the poem's measure (folds, cue, input, status, controls), so the
  visible line and the line being written stand where they will in the finished poem. A cut
  wall preview fades its last lines and links "continue reading on the wall, N more lines";
  a poem only one line over the preview is shown whole. Both cut-out headings carry alt text
  ("Exquisite Corpse", "The Wall"); the accessibility tree names them as h1 and h2.
- 2026-09-03: variety. The model's opening and its reply to the first line each get one
  random frame (ten openings, eight replies); "redo turn" records the popped model line
  under its turn index and the next attempt is told, under SET ASIDE, not to repeat or
  paraphrase it and to change its move; those turns run at temperature 1.05. The play
  prompt's VARIETY clause bans stock vocabulary and asks for a different opening word.

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

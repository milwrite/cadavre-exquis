# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pipeline that scrapes public-domain surrealist/modernist poetry, reshapes it into
next-line-continuation examples, QLoRA-fine-tunes a small Gemma, and serves the
adapter from a multi-LoRA vLLM host that feeds an *Exquisite Corpse* game UI.
The Open WebUI wrapper and the Cloudflare Worker (`CADAVRE_DEFAULT_MODEL`,
`@cf/deepseek-ai/deepseek-v4-flash-0731`) default to DeepSeek V4 Flash; local vLLM
routes use the `exquisite-corpse` adapter.

**`PROGRESS.md` is the source of truth** for what's done and what's next.
`CONTINUE.md` is the runbook the scheduled agent follows.

## Commands
```bash
# env: two venvs. .venv (py3.12) for the data pipeline + training; the vLLM host
# lives at /home/milwrite/vllm-serve (separate).
.venv/bin/pip install -r requirements.txt          # pipeline deps
.venv/bin/pip install -r requirements-train.txt     # torch/unsloth/trl (GPU box)

# data pipeline — JSONL between every stage. Sources are resumable (--force to redo).
.venv/bin/python -m src.sources.poetrydb            # -> data/raw/poetrydb.jsonl
.venv/bin/python -m src.sources.gutenberg           # curated volumes via Gutendex
.venv/bin/python -m src.sources.gutenberg_corpus --max 15000
.venv/bin/python -m src.clean                       # merge/dedup -> data/interim/poems.jsonl
.venv/bin/python -m src.build_dataset               # -> data/processed/next_line.{train,val}.jsonl
# ALWAYS rerun clean + build after any source changes.

# train (see "Training vs serving" — must free the GPU first)
MODEL=unsloth/gemma-4-E4B-it .venv/bin/python train/train_qlora.py --max-steps 2500
.venv/bin/python train/eval_compare.py              # base vs tuned on held-out prefixes

# serve: multi-LoRA vLLM host on :1234 (base + all adapters)
./scripts/vllm_serve.sh                             # foreground; nohup ... & for bg

# play UI (local): serve from localhost so Ollama/vLLM CORS allows it
./ui/serve.sh                                        # parlor -> :8800/ · open sheet -> :8800/ui/corpse.html
CAIL_API_KEY=sk-cail-... ./ui/serve-cail.sh          # same pages via the CUNY AI Lab Gateway relay (ui/cail_proxy.py)
(cd worker && npm run dev)                          # the Cloudflare Worker locally (AI binding is remote; see worker/README.md)
(cd worker && npm run deploy)                       # deploy cail-cadavre to the CUNY AI Lab account (workers.dev only)
npm test                                             # Node game-rule tests + Python relay tests + Worker unit tests
```

## Architecture
- **Pipeline stages are decoupled by JSONL.** Each `src/sources/*.py` writes one
  poem record per line (`{source,title,author,year,lines[],meta}`; `lines` uses
  `""` for stanza breaks) to `data/raw/`. `clean.py` merges + dedups (clean
  sources win over the `gpc` padding, which is down-weighted and never in val).
  `build_dataset.py` slices poems into next-line chat pairs, split **by poem**.
- **The dataset is model-agnostic.** Examples store structured `{role,content}`
  messages; the chat template and the response-only loss mask are applied at
  *train* time (`train/train_qlora.py`), so the same data trains any Gemma.
- **Chat markers are auto-detected from the base's own template.** gemma-3 uses
  `<start_of_turn>…`, gemma-4 **E4B uses `<|turn>…`** — hardcoding one masks every
  label ("nothing to train on"). `detect_parts()` renders a probe to read them.
- **Serving is a multi-LoRA host.** One base (`unsloth/gemma-4-E4B-it`) in VRAM;
  each adapter (`cloze-reader`, `jeopardylm`, `exquisite-corpse`) is selected
  per-request via the OpenAI `model` field. Adapters MUST be trained on the same
  base and within `--max-lora-rank 32`. The canonical launcher is
  `../cloze-reader-monorepo/finetune/deploy/serve_gemma.sh`; `scripts/vllm_serve.sh`
  is this repo's copy (adds `exquisite-corpse`).
- **Two UIs, one contract.** `index.html` ("the parlor": 2–4 players, folded
  concealment, reveal/wall — the GitHub Pages landing) and `ui/corpse.html`
  ("the open sheet": minimal solo) both POST to an OpenAI-compatible endpoint
  and embed the corpse **system prompt** — the game logic lives there, so it
  works against a base *or* tuned model. Config layers: defaults (vLLM
  `127.0.0.1:1234`, adapter `exquisite-corpse`) < gitignored
  `ui/config.local.js` (`window.CORPSE_CONFIG`, loaded via `<script src>` that
  404s harmlessly on Pages) < `?endpoint=…&model=…` URL params. The parlor
  builds the revealed poem from its own state — only the close reading needs
  the model.
- **The wall has its own page.** `wall.html` shows every pin as one card — the
  whole poem on the left (flush left in its pane, never cut or paged), its
  always-open reading to the right — with votes, rename, and unpinning for the hand that
  holds the delete token; `index.html` previews only the newest three pins in the
  same card (no votes) and links into `wall.html#pin-<id>`. The card CSS is
  duplicated across the two files, so change both together. Both resolve the wall endpoint the same way
  (`CFG.wallEndpoint` from `ui/config.local.js`, else inference-arcade.com), and the
  Worker copies `wall.html` into `dist/` (served at `/wall`).
- **The parlor is one column.** Masthead (cut-out title, epigraph on one line at
  ≥48rem), a short intro, then the table, the sheet, or the reveal in the same
  column; `main#stage` carries `is-playing` / `is-revealed`, which hide the intro
  and (while playing) the wall. From 60rem the reveal sets the poem flush left
  beside its close reading. Serif for verse, intro, and reading; a system sans
  (`--sans`) for every control and status line.
- **The model's turn has a floor and a shape.** `modelTurn` awaits both the reply
  and `MODEL_MIN_WAIT_MS` (3 s) so the hand that just folded can still hit
  "reveal poem" and end on its own line; the reveal drops the in-flight reply.
  `shapeNote()` adds a SHAPE paragraph to the play prompt keyed to the fold count,
  asking for a closable line once the poem is long. Keep both when editing the prompt.
- **Openings and redone turns are steered.** `OPENING_FRAMES` / `REPLY_FRAMES` add one
  random frame to the model's first two turns; `setAside` (keyed by turn index) records
  every model line popped by "redo turn" and lists it in the next prompt as SET ASIDE;
  those turns run at temperature 1.05 instead of 0.8. The system prompt's VARIETY
  clause bans stock poetic vocabulary. A human line clears set-asides for later turns.
- **Both UIs are single self-contained files, no build step.** Each inlines all
  CSS (one `<style>`) and JS (one `<script>`); no bundler, no shared stylesheet,
  system-font stacks only. The shared ink/bone design tokens (`:root` custom
  properties) are **re-declared per file** — the identity is convention, so
  change both together. `index.html` uses the wine accent (`--wine`, "the
  model's hand"); `ui/corpse.html` is deliberately monochrome but shares the scale,
  the flush-left column, and the sans chrome; its settings live behind a paper tab
  (`#panel-tab`) on the right edge. The reveal renders
  the poem as per-word `<span>`s and links the close reading to it by parsing the
  reading's **quoted phrases** and matching them to those words — so the reading
  prompt's "quote the exact words you point to" is a load-bearing UI contract,
  not just a style instruction.
- The corpse system prompt's canonical source is the Open WebUI export
  `exquisite-corpse-*.json` (`params.system`); `deploy/build_ollama_model.py`
  reads it to wrap a GGUF for Ollama.

## Gotchas that require context
- **Training and the vLLM host can't share the GPU.** The server launches with
  `--gpu-memory-utilization 0.90`, leaving ~1.6 GB free. To train locally you
  must stop vLLM first (takes the other adapters offline), then restart it.
- **Blackwell (RTX 5090, sm_120) needs `VLLM_USE_FLASHINFER_SAMPLER=0`** or the
  vLLM engine core dies at startup ("FlashInfer requires GPUs with sm75 or
  higher"). `scripts/vllm_serve.sh` exports it; don't drop it.
- **Git: commits are authored by `zmuhls`** (`git config` is set repo-locally).
  The remote is `milwrite/cadavre-exquis` (PUBLIC). A plain `git push` uses the
  `zmuhls` credential and gets 403 on milwrite's repo — push with milwrite's
  token: `git push "https://x-access-token:$(gh auth token --user milwrite)@github.com/milwrite/cadavre-exquis.git" master`.
- **The CAIL Gateway allows no browser CORS and blocks `Python-urllib` UAs
  (Cloudflare error 1010).** `ui/cail_proxy.py` relays with the key server-side
  and its own User-Agent; it also switches thinking off for reasoning models,
  which otherwise return empty `content` at the game's 80-token turn budget.
- **A daily-noon cron** (`scripts/continue.sh`) runs a headless agent against
  `CONTINUE.md` and commits one step per run. It's autonomous (`bypassPermissions`).

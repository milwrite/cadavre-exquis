# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pipeline that scrapes public-domain surrealist/modernist poetry, reshapes it into
next-line-continuation examples, QLoRA-fine-tunes a small Gemma, and serves the
adapter from a multi-LoRA vLLM host that feeds an *Exquisite Corpse* game UI.

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
./ui/serve.sh                                        # -> http://localhost:8800/corpse.html
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
- **A daily-noon cron** (`scripts/continue.sh`) runs a headless agent against
  `CONTINUE.md` and commits one step per run. It's autonomous (`bypassPermissions`).

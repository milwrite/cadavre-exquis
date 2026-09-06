#!/usr/bin/env bash
# retrain.sh — operator script for PROGRESS.md follow-up #8: retrain the
# exquisite-corpse adapter on the cleaned corpus (post-#4/#7), then re-serve
# and re-measure against the pinned baseline.
#
# This is deliberately NOT a cron step: it stops the shared multi-LoRA vLLM
# host, taking cloze-reader + jeopardylm offline for the duration of training
# (hours). Run it when that's acceptable:
#
#   ./scripts/retrain.sh                 # full cycle: stop vLLM -> train -> serve -> eval
#   SKIP_EVAL=1 ./scripts/retrain.sh     # stop after restarting the server
#
# Target to beat (pinned 2026-08-03, PROGRESS.md #8): tuned NLL/tok < 3.6581
# on val sha256 481b0a3dd556 (eval_nll.py --n 400 --seed 11).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
PY=.venv/bin/python
LOG_DIR=logs
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TRAIN_LOG="$LOG_DIR/retrain-$STAMP.log"

VAL=data/processed/next_line.val.jsonl
PINNED_VAL_SHA=481b0a3dd556          # baseline's val fingerprint (docs/eval-nll.md)
BASELINE_TUNED_NLL=3.6581            # shipped adapter on that val — the number to beat
SHIPPED_ARCHIVE=outputs/lora-shipped-20260715   # adapter trained on the 2026-07-15 snapshot

step() { printf '\n== %s ==\n' "$*"; }

# -- 1. preflight -------------------------------------------------------------
step "preflight: regression suite"
$PY -m unittest discover -s tests

step "preflight: val fingerprint"
val_sha=$(sha256sum "$VAL" | cut -c1-12)
echo "val: $(wc -l < "$VAL") examples, sha256 $val_sha (baseline pinned: $PINNED_VAL_SHA)"
if [ "$val_sha" != "$PINNED_VAL_SHA" ]; then
  if [ "${FORCE:-0}" != "1" ]; then
    echo "ABORT: val no longer matches the pinned baseline — the 3.6581 target" >&2
    echo "would be apples-to-oranges. Re-pin a baseline first (eval_nll.py against" >&2
    echo "the live host), or rerun with FORCE=1 to train anyway." >&2
    exit 1
  fi
  echo "FORCE=1: continuing despite val drift (baseline comparison will be invalid)"
fi

# -- 2. archive the shipped adapter ------------------------------------------
# train_qlora.py writes to outputs/lora, which currently holds the production
# adapter (the one on HF / behind the game UI). Keep a byte-exact copy so a bad
# retrain is recoverable: rm -rf outputs/lora && cp -a $SHIPPED_ARCHIVE outputs/lora
step "archive shipped adapter"
if [ -d "$SHIPPED_ARCHIVE" ]; then
  echo "already archived: $SHIPPED_ARCHIVE"
else
  cp -a outputs/lora "$SHIPPED_ARCHIVE"
  echo "archived outputs/lora -> $SHIPPED_ARCHIVE"
fi

# -- 3. stop the vLLM host ----------------------------------------------------
step "stop vLLM host (cloze-reader + jeopardylm go offline until restart)"
if pgrep -f 'vllm serve unsloth/gemma-4-E4B-it' >/dev/null; then
  pkill -f 'vllm serve unsloth/gemma-4-E4B-it' || true
  for _ in $(seq 60); do
    pgrep -f 'vllm serve unsloth/gemma-4-E4B-it' >/dev/null || break
    sleep 2
  done
  if pgrep -f 'vllm serve unsloth/gemma-4-E4B-it' >/dev/null; then
    echo "ABORT: vLLM did not exit after 120s; stop it manually and rerun." >&2
    exit 1
  fi
else
  echo "no vLLM host running"
fi
# Wait for the CUDA context to actually release VRAM, not just the pid to die.
for _ in $(seq 30); do
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
  [ "$used" -lt 3000 ] && break
  sleep 2
done
echo "GPU memory in use: ${used} MiB"
if [ "$used" -ge 3000 ]; then
  echo "ABORT: GPU still holds ${used} MiB after 60s — something else has it." >&2
  exit 1
fi

# -- 4. train -----------------------------------------------------------------
# Same recipe as the shipped adapter (PROGRESS.md "Train QLoRA"): E4B base,
# r=16 (default), 2500 steps. Override via STEPS=... for a longer run.
step "train (log: $TRAIN_LOG)"
MODEL=unsloth/gemma-4-E4B-it $PY train/train_qlora.py \
  --max-steps "${STEPS:-2500}" 2>&1 | tee "$TRAIN_LOG"
test -f outputs/lora/adapter_model.safetensors \
  || { echo "ABORT: training finished but outputs/lora has no adapter weights." >&2
       echo "Shipped adapter is safe in $SHIPPED_ARCHIVE." >&2; exit 1; }

# -- 5. restart the vLLM host -------------------------------------------------
# vllm_serve.sh serves outputs/lora directly, so the restart picks up the new
# adapter with no config change.
step "restart vLLM host"
nohup ./scripts/vllm_serve.sh > "$LOG_DIR/vllm-$STAMP.log" 2>&1 &
echo "waiting for :1234 (model load takes a few minutes)..."
for _ in $(seq 120); do
  curl -sf http://127.0.0.1:1234/v1/models >/dev/null && break
  sleep 5
done
curl -sf http://127.0.0.1:1234/v1/models >/dev/null \
  || { echo "ABORT: server not up after 10 min — see $LOG_DIR/vllm-$STAMP.log" >&2; exit 1; }
echo "server up"

# -- 6. re-eval against the pinned baseline -----------------------------------
if [ "${SKIP_EVAL:-0}" = "1" ]; then
  step "SKIP_EVAL=1 — done. Run manually: $PY train/eval_nll.py --n 400 --seed 11"
  exit 0
fi
step "eval (same 400 examples as the pinned baseline)"
$PY train/eval_nll.py --n 400 --seed 11
echo
echo "Compare docs/eval-nll.md 'tuned' NLL/tok against the pre-retrain baseline:"
echo "  shipped adapter was $BASELINE_TUNED_NLL — lower is better."
echo "If it regressed, restore: rm -rf outputs/lora && cp -a $SHIPPED_ARCHIVE outputs/lora"
echo "then rerun ./scripts/vllm_serve.sh. If it improved: update PROGRESS.md #8,"
echo "push the new adapter to HF, and refresh the dataset mirror's provenance pin."

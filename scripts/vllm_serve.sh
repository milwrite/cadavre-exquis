#!/usr/bin/env bash
# Restart the multi-LoRA vLLM server with the exquisite-corpse adapter added as a
# third module, alongside the existing cloze-reader + jeopardylm adapters.
# Base model + flags mirror the original launch; only --max-loras (2->3) and the
# extra --lora-modules entry are new.
#
#   ./scripts/vllm_serve.sh            # foreground
#   nohup ./scripts/vllm_serve.sh &    # background
set -uo pipefail

# RTX 5090 is Blackwell (sm_120): this vLLM build's FlashInfer sampler fails to
# init ("FlashInfer requires GPUs with sm75 or higher"). Disable it and use
# FlashAttention — matches cloze-reader-monorepo/finetune/deploy/serve_gemma.sh.
export VLLM_USE_FLASHINFER_SAMPLER="${VLLM_USE_FLASHINFER_SAMPLER:-0}"
export VLLM_ATTENTION_BACKEND="${VLLM_ATTENTION_BACKEND:-FLASH_ATTN}"

CORPSE_LORA="${CORPSE_LORA:-/home/milwrite/exquisite-corpse/outputs/lora}"

exec /home/milwrite/vllm-serve/bin/vllm serve unsloth/gemma-4-E4B-it \
  --host 127.0.0.1 --port 1234 \
  --dtype bfloat16 \
  --max-model-len 6144 \
  --gpu-memory-utilization 0.90 \
  --enable-lora --max-lora-rank 32 --max-loras 3 \
  --lora-modules \
    cloze-reader=milwright/cloze-reader-gemma-4-e4b-lora \
    jeopardylm=milwright/jeopardylm-gemma-4-e4b-lora \
    "exquisite-corpse=${CORPSE_LORA}"

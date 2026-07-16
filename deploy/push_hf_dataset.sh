#!/usr/bin/env bash
# Push the next-line-continuation dataset to a PRIVATE Hugging Face dataset repo.
#
# Public-domain / openly-licensed text only (provenance: data/processed/dataset_card.md).
# Idempotent: safe to re-run. Regenerate the data first with
#   .venv/bin/python -m src.clean && .venv/bin/python -m src.build_dataset
# so what ships matches the counts in the card.
#
# Auth: uses the stored `hf` token (logged in as milwright). Override the repo
# with REPO=... if you want a different namespace.
set -euo pipefail

REPO="${REPO:-milwright/exquisite-corpse-next-line}"
PROC="data/processed"
HF="${HF:-.venv/bin/hf}"

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# HF dataset card = YAML frontmatter (viewer config + tags) + the human card body.
cat > "$BUILD/README.md" <<'FRONTMATTER'
---
license: other
language:
- en
task_categories:
- text-generation
tags:
- poetry
- surrealism
- modernism
- next-line-continuation
- public-domain
- gemma
pretty_name: Surrealist / Modernist Next-Line Corpus
size_categories:
- 100K<n<1M
configs:
- config_name: default
  data_files:
  - split: train
    path: next_line.train.jsonl
  - split: validation
    path: next_line.val.jsonl
---

FRONTMATTER
cat "$PROC/dataset_card.md" >> "$BUILD/README.md"

# Create the repo PRIVATE (idempotent), and re-assert private on re-runs.
"$HF" repos create "$REPO" --type dataset --private --exist-ok
"$HF" repos settings "$REPO" --type dataset --private

# Upload card + splits + stats (one commit each; fresh repo, so noise is fine).
"$HF" upload "$REPO" "$BUILD/README.md"              README.md            --type dataset --commit-message "dataset card (+ viewer config)"
"$HF" upload "$REPO" "$PROC/next_line.train.jsonl"   next_line.train.jsonl --type dataset --commit-message "train split"
"$HF" upload "$REPO" "$PROC/next_line.val.jsonl"     next_line.val.jsonl   --type dataset --commit-message "val split"
"$HF" upload "$REPO" "$PROC/dataset_stats.json"      dataset_stats.json    --type dataset --commit-message "dataset stats"

echo "Done -> https://huggingface.co/datasets/$REPO (private)"

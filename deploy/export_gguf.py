"""Export the EXISTING shipped LoRA adapter (`outputs/lora`) to a GGUF adapter —
WITHOUT retraining and WITHOUT touching the GPU, so the multi-LoRA vLLM host
(base + cloze-reader/jeopardylm/exquisite-corpse) keeps serving throughout.

Why not `GGUF=1 python train/train_qlora.py`?  That path runs `trainer.train()`
first — it retrains from scratch (`--epochs 2` ≈ 28k steps) and the GGUF it saves
would be a *different* adapter than the 2500-step one shipped to HF and served by
vLLM. This converts the actual production adapter, so the local llama.cpp/Ollama
weights match what the game already uses.

Why a GGUF *adapter* and not a merged model?  The base is Gemma-4 **E4B**, whose
projection layers are `Gemma4ClippableLinear` (the elastic-MatFormer wrapper).
`peft` refuses to attach/merge a LoRA onto that custom class, and the reliable
Unsloth merge needs exclusive GPU — held by the production vLLM host (~3 GB free).
llama.cpp's `convert_lora_to_gguf.py`, by contrast, reads the adapter safetensors
directly and remaps tensor names by string, so it never instantiates the custom
module: it converts cleanly on CPU. The result is a GGUF LoRA that llama.cpp
(`--lora`) / Ollama (`ADAPTER`) apply over the base GGUF at load time.

    .venv/bin/python deploy/export_gguf.py     # -> outputs/gguf/exquisite-corpse-lora-bf16.gguf

Env:
    BASE     base model whose config supplies tensor dims/arch
             (default unsloth/gemma-4-E4B-it — the base vLLM serves).
    OUTTYPE  adapter dtype (default bf16; LoRA deltas are tiny, so 16-bit is
             the right fidelity — quantizing them buys nothing).
"""
from __future__ import annotations

import glob
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LORA = ROOT / "outputs" / "lora"
GGUF_DIR = ROOT / "outputs" / "gguf"
LLAMA = pathlib.Path.home() / ".unsloth" / "llama.cpp"
CONVERT_LORA = LLAMA / "convert_lora_to_gguf.py"

BASE = os.environ.get("BASE", "unsloth/gemma-4-E4B-it")
OUTTYPE = os.environ.get("OUTTYPE", "bf16")
OUT = GGUF_DIR / f"exquisite-corpse-lora-{OUTTYPE}.gguf"


def log(msg: str) -> None:
    print(f"[export_gguf] {msg}", flush=True)


def resolve_base_config() -> str:
    """Return a local dir with the base config (for tensor dims/arch), or the
    hub id itself if not cached — convert_lora_to_gguf will fetch just the config.
    """
    hits = sorted(glob.glob(str(
        pathlib.Path.home() / ".cache" / "huggingface" / "hub"
        / f"models--{BASE.replace('/', '--')}" / "snapshots" / "*")))
    return hits[-1] if hits else BASE


def main() -> None:
    if not LORA.exists():
        raise SystemExit(f"no adapter at {LORA} — nothing to export")
    if not CONVERT_LORA.exists():
        raise SystemExit(f"missing {CONVERT_LORA} — is Unsloth's llama.cpp present?")
    if OUT.exists():
        log(f"already present: {OUT} — nothing to do (delete to re-export)")
        return

    GGUF_DIR.mkdir(parents=True, exist_ok=True)
    base = resolve_base_config()
    log(f"converting adapter -> {OUT.name}  (base config: {base})")
    subprocess.run(
        [sys.executable, str(CONVERT_LORA), str(LORA),
         "--base", base, "--outtype", OUTTYPE, "--outfile", str(OUT)],
        check=True, cwd=str(LLAMA))

    size_mb = OUT.stat().st_size / 1e6
    log(f"DONE -> {OUT} ({size_mb:.1f} MB)")
    log("apply:  llama-cli -m <base.gguf> --lora " + OUT.name)
    log("or:     .venv/bin/python deploy/build_ollama_model.py --create  (writes an ADAPTER Modelfile)")


if __name__ == "__main__":
    main()

"""Close the loop: wrap the fine-tuned GGUF with the real Exquisite Corpse system
prompt (read from the Open WebUI model export) into a ready-to-run Ollama model.

    train_qlora.py (GGUF=1)  ->  outputs/gguf/*.gguf
    this script              ->  deploy/Modelfile  +  `ollama create`

Usage:
    .venv/bin/python deploy/build_ollama_model.py [--name exquisite-corpse-tuned] [--create]

Without --create it just writes the Modelfile and prints the command, so you can
inspect before building. The system prompt stays the single source of truth in
the Open WebUI JSON export — we never fork it.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
GGUF_DIR = ROOT / "outputs" / "gguf"
MODELFILE = ROOT / "deploy" / "Modelfile"


def find_system_prompt() -> str:
    for js in ROOT.glob("exquisite-corpse-*.json"):
        try:
            data = json.loads(js.read_text())
            sysp = data[0]["params"]["system"]
            if sysp:
                return sysp
        except Exception:  # noqa: BLE001
            continue
    raise SystemExit("could not find the Exquisite Corpse system prompt in "
                     "exquisite-corpse-*.json")


def find_gguf() -> tuple[str, bool]:
    """Return (gguf_path, is_adapter). A LoRA *adapter* GGUF (what
    deploy/export_gguf.py produces for the E4B base — see its docstring for why a
    merged model isn't) needs a base GGUF under `FROM` + an `ADAPTER` line; a
    merged model GGUF is used directly under `FROM`."""
    hits = sorted(glob.glob(str(GGUF_DIR / "*.gguf")))
    if not hits:
        raise SystemExit(f"no GGUF in {GGUF_DIR} — run: python deploy/export_gguf.py")
    for h in hits:  # prefer a merged q4_k_m if one was produced
        if "q4_k_m" in h.lower() and "lora" not in h.lower():
            return h, False
    adapters = [h for h in hits if "lora" in h.lower()]
    if adapters:
        return adapters[0], True
    return hits[0], False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="exquisite-corpse-tuned")
    ap.add_argument("--base", default=os.environ.get("BASE_GGUF"),
                    help="base model GGUF for FROM when the export is a LoRA "
                         "adapter (or set BASE_GGUF); an Ollama model name works too")
    ap.add_argument("--create", action="store_true", help="run `ollama create` now")
    args = ap.parse_args()

    system = find_system_prompt()
    gguf, is_adapter = find_gguf()
    rel = pathlib.Path(gguf).relative_to(ROOT) if str(gguf).startswith(str(ROOT)) else gguf

    if is_adapter:
        if not args.base:
            raise SystemExit(
                f"{rel} is a LoRA adapter GGUF — pass --base <base.gguf> (the "
                "gemma-4-E4B base GGUF, or an Ollama model name) so Ollama has a "
                "model to apply the adapter to. Set BASE_GGUF to skip the flag.")
        # `--base` is used verbatim: a GGUF path (e.g. ./base.gguf) or an Ollama
        # model name (e.g. hf.co/unsloth/gemma-4-E4B-it-GGUF) both work in FROM.
        head = f"FROM {args.base}\nADAPTER ./{rel}\n"
    else:
        head = f"FROM ./{rel}\n"

    # Gemma GGUFs carry their own chat template; we only set SYSTEM, stop token,
    # and low-randomness params suited to the one/two-word corpse turns.
    modelfile = (
        head
        + 'PARAMETER stop "<end_of_turn>"\n'
        + "PARAMETER temperature 0.9\n"
        + "PARAMETER top_p 0.95\n"
        + f'SYSTEM """{system}"""\n'
    )
    MODELFILE.write_text(modelfile)
    print(f"wrote {MODELFILE}  ({'ADAPTER ' if is_adapter else 'FROM '}{rel})")
    argv = ["ollama", "create", args.name, "-f", str(MODELFILE)]
    if args.create:
        import subprocess
        print("$ " + " ".join(argv))
        subprocess.run(argv, cwd=ROOT, check=False)  # list form, no shell → no injection
    else:
        print(f"\nnext:  {' '.join(argv)}\ntest:  ollama run {args.name}  (one or two words)")


if __name__ == "__main__":
    main()

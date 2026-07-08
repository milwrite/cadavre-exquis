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


def find_gguf() -> str:
    hits = sorted(glob.glob(str(GGUF_DIR / "*.gguf")))
    if not hits:
        raise SystemExit(f"no GGUF in {GGUF_DIR} — run: GGUF=1 python train/train_qlora.py")
    # prefer a q4_k_m if present
    for h in hits:
        if "q4_k_m" in h.lower():
            return h
    return hits[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="exquisite-corpse-tuned")
    ap.add_argument("--create", action="store_true", help="run `ollama create` now")
    args = ap.parse_args()

    system = find_system_prompt()
    gguf = find_gguf()
    rel = pathlib.Path(gguf).relative_to(ROOT) if str(gguf).startswith(str(ROOT)) else gguf

    # Gemma GGUFs carry their own chat template; we only set SYSTEM, stop token,
    # and low-randomness params suited to the one/two-word corpse turns.
    modelfile = (
        f"FROM ./{rel}\n"
        f'PARAMETER stop "<end_of_turn>"\n'
        f"PARAMETER temperature 0.9\n"
        f"PARAMETER top_p 0.95\n"
        f'SYSTEM """{system}"""\n'
    )
    MODELFILE.write_text(modelfile)
    print(f"wrote {MODELFILE}  (FROM {rel})")
    argv = ["ollama", "create", args.name, "-f", str(MODELFILE)]
    if args.create:
        import subprocess
        print("$ " + " ".join(argv))
        subprocess.run(argv, cwd=ROOT, check=False)  # list form, no shell → no injection
    else:
        print(f"\nnext:  {' '.join(argv)}\ntest:  ollama run {args.name}  (one or two words)")


if __name__ == "__main__":
    main()

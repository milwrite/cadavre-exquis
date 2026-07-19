# Ollama LoRA — blocker resolved on 0.31.1 (verified 2026-07-19)

The last open item in `PROGRESS.md` was **(opt) Ollama model**, blocked since
2026-07-18: on Ollama **0.24.0** the gemma-4 **E4B** base ran on Ollama's *native
engine*, which did **not** implement LoRA `ADAPTER` layers — `ollama create`
succeeded but `ollama run` died at init with
`500 … failed to initialize model: loras are not yet implemented`.

**That blocker is now gone.** A newer Ollama (**0.31.1**) is installed at
`/usr/local/bin/ollama`. It runs gemma-4 through the **llama.cpp `llama-server`
runner** (which supports LoRA), not the native engine — so the shipped adapter
GGUF loads and is applied.

## What was verified (non-destructively)

The production server on the default port is still the **snap** build (0.24.0),
so the test ran an **isolated** 0.31.1 server — alt port `11666`, its own model
store, base blobs copied read-only from the snap store, CPU-only (`num_gpu 0`).
Nothing touched the running daemon, the cloze-reader shim, or the GPU (vLLM).

1. `ollama create ec-loratest` from `FROM gemma4:e4b` + `ADAPTER
   outputs/gguf/exquisite-corpse-lora-bf16.gguf` → **success** (exit 0).
2. `POST /api/generate` → **generated** (no "loras are not yet implemented").
3. Runner log proves the adapter is loaded and applied — 0.31.1 launches
   `llama-server … --lora …sha256-14b2…` and logs:
   ```
   llama_adapter_lora_init_impl: loading lora adapter from '…exquisite-corpse-lora…' ...
     general.architecture = gemma4
     general.type         = adapter
     adapter.type         = lora
     adapter.lora.alpha   = 16.000000     # matches the trained config
   ```
4. Adapter is **genuinely applied**, not silently dropped — greedy (temp 0),
   same prompt `"The clock melted over the"`:
   - base `gemma4:e4b`  → *(empty; the base won't continue a bare line)*
   - tuned `ec-loratest` → `clock face, dripping down to the floor. The hands
     were still stuck at 10:15. …`

## Remaining step is operational, not a code/data step

To make this usable on the **default** Ollama port (what the UIs / shim hit), the
system's active Ollama server must be the **0.31.1** build rather than the snap
**0.24.0** one. Today the `ollama.service` systemd unit (`/usr/local/bin/ollama
serve`, 0.31.1) is stuck in an auto-restart loop because the snap daemon holds
port 11434. Switching runtimes affects other Ollama consumers on this box
(cloze-reader shim, `cpt-qwen`, gemma3 models), so it's left as a **deliberate
manual op** for the operator, not an autonomous cron action:

```bash
sudo snap stop ollama && sudo snap disable ollama   # free port 11434
sudo systemctl restart ollama                       # 0.31.1 takes over
ollama --version                                    # expect server 0.31.1
```

Then build the real model (adds the corpse SYSTEM prompt) and run it:

```bash
.venv/bin/python deploy/build_ollama_model.py --base gemma4:e4b --create
ollama run exquisite-corpse-tuned            # one or two words
```

The tuned adapter is already served locally by the multi-LoRA **vLLM** host on
:1234 (`exquisite-corpse`), which the UIs point at; Ollama remains a convenience
alternative — now a working one, once the daemon switch above is made.

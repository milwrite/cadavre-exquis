# Play surfaces

Two pages use one OpenAI-compatible chat contract and carry the game in their
system prompts, so they work with the tuned Gemma or an Ollama Cloud model.

- **`/index.html` — the parlor.** The featured GitHub Pages landing seats 2–4
  players plus the model. Contributions stay folded until the game ends, when
  the page reveals the poem, requests a close reading, and offers export,
  printing, and a shared wall.
- **`/ui/corpse.html` — the open sheet.** The solo page keeps the caret at the
  poem's growing edge. Type one or two words and press Enter; enter `.` to close
  the poem and request its reading.

## Run locally

```bash
cp ui/config.example.js ui/config.local.js   # optional local override
./ui/serve.sh                                # http://localhost:8800/
                                             # http://localhost:8800/ui/corpse.html
```

Serve from `localhost`, rather than `file://`, and start the multi-LoRA vLLM
host with `./scripts/vllm_serve.sh`. The local default connects directly to
`http://127.0.0.1:1234/v1/chat/completions` with model
`exquisite-corpse`. Because the local default has no model catalog, each page
shows one direct local vLLM choice.

## Published routes and model selection

Published pages use the inference-arcade.com proxy. GitHub Pages sends chat
requests to `https://inference-arcade.com/api/cadavre/chat` and loads the model
catalog from `https://inference-arcade.com/api/cadavre/models`. The mirrored
inference-arcade.com page uses the same paths on its own origin.

Before accepting the first turn, each published surface calls
`https://inference-arcade.com/api/cadavre/ready`. That endpoint performs a real,
cached generation check, keeps the chosen logical model warm, and returns a
verified standby route when the selected providers are unavailable. The parlor
keeps its Begin action disabled until this check succeeds.

The parlor loads and pins finished poems through
`https://inference-arcade.com/api/cadavre/wall` (or the same-origin equivalent
on Inference Arcade). The wall is shared across browsers. A browser receives a
private delete capability only when it creates a pin, so it can remove its own
pin without receiving access to anyone else's.

The catalog returns:

```text
{ default, models: [{ id, label, provider, model, available }] }
```

The open-sheet selector places an available fine-tuned Legion route first,
groups the Cloud routes together, and disables any route reported as
unavailable. The parlor shows one clean, server-managed model choice. Every
chat response reports the effective route, so either surface follows a
verified standby without repeating a failed provider. Selection state remains
in memory for the current page and never enters browser storage.

The Ollama Cloud credential stays in the server environment used by the proxy.
The browser receives the model list and chat response, but no provider
credential. Keep local credentials only in the gitignored `config.local.js`;
never put them in a URL, committed source, browser storage, or logs.

## Configuration precedence

The most specific setting wins:

1. Environment-aware defaults: direct vLLM on localhost; proxy chat and model
   catalog on published hosts.
2. `ui/config.local.js`, when a local or private override is needed.
3. `?endpoint=…&model=…` for one visit. These values are never persisted.

A URL connection override uses one configured model choice instead of combining
that endpoint with the published catalog. Endpoints must resolve to HTTP or
HTTPS. There is no URL parameter for credentials.

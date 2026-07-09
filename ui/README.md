# Play surfaces

Two pages, one contract — both POST to an OpenAI-compatible endpoint and carry
the game in their system prompt, so they work against a base *or* tuned Gemma.

- **`/index.html` — the parlor.** The featured page (GitHub Pages landing).
  Seats 2–4 players plus the model; contributions are folded out of sight as
  the sheet passes, the way the game is actually played. Ending the game
  unfolds the poem, fetches a close reading, and offers export / print /
  pin-to-the-wall (the wall lives in localStorage).
- **`/ui/corpse.html` — the open sheet.** Intensely minimal, solo: no
  container, no buttons — the caret is the poem's growing edge. Type one or
  two words, enter; `.` closes the game and brings the reading.

## Run
```bash
cp ui/config.example.js ui/config.local.js   # optional: defaults already fit vLLM on :1234
./ui/serve.sh                                # -> http://localhost:8800/  (parlor)
                                             #    http://localhost:8800/ui/corpse.html
```
Serve from `localhost` (not `file://`) so the model host's CORS allows it, and
make sure a model is up — either the multi-LoRA vLLM host
(`./scripts/vllm_serve.sh`, adapter `exquisite-corpse`) or Ollama
(`ollama run exquisite-corpse-tuned`).

## Configuration
Layered, most specific wins:

1. defaults — vLLM host at `http://127.0.0.1:1234`, model `exquisite-corpse`
2. `ui/config.local.js` (gitignored; 404s harmlessly on Pages)
3. URL params: `?endpoint=…&model=…` — handy for pointing the Pages
   deployment at your own machine. Ephemeral by design: overrides last one
   visit and are never persisted, so a crafted link can't quietly repoint
   the app for good. Endpoints must be parseable http(s) URLs.

API keys never travel in URLs (they leak via browser history) — put a key in
`config.local.js` only. A browser-embedded key is fine for personal local
use; don't ship one.

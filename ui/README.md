# Play surface

An intensely minimal page for playing exquisite corpse: no container, no borders,
no buttons — the blinking caret *is* the poem's growing edge. Type one or two
words, press enter, watch it unfold; type `.` to close and get the reading.

## Run
```bash
cp ui/config.example.js ui/config.local.js   # then set model/endpoint (local file is gitignored)
./ui/serve.sh                                 # -> http://localhost:8800/corpse.html
```
Serving from `localhost` (not `file://`) so Ollama accepts the request. Make sure
your model is available:
```bash
ollama run exquisite-corpse-tuned   # or build it: python deploy/build_ollama_model.py --create
```

## Notes
- The game logic lives in the embedded system prompt, so this works against a
  base *or* fine-tuned Gemma — the fine-tune just makes the continuations better.
- Hosted endpoint instead of local? Set `endpoint`/`apiKey` in `config.local.js`.
  A browser-embedded key is fine for personal local use; don't ship it.

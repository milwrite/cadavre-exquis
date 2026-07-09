// Copy to config.local.js (gitignored) and edit. Both index.html and
// ui/corpse.html read window.CORPSE_CONFIG; URL params (?endpoint=…&model=…)
// override it per-visit.
window.CORPSE_CONFIG = {
  // Multi-LoRA vLLM host (OpenAI-compatible); the adapter is selected via
  // the model field. No key needed for localhost.
  endpoint: "http://127.0.0.1:1234/v1/chat/completions",
  model:    "exquisite-corpse",
  apiKey:   "",

  // Local Ollama instead (after deploy/build_ollama_model.py --create):
  // endpoint: "http://localhost:11434/v1/chat/completions",
  // model:    "exquisite-corpse-tuned",

  // Hosted endpoint? Point at it and set apiKey — fine for personal local
  // use; never commit or ship a key.
  // endpoint: "https://ollama.com/v1/chat/completions",
  // model:    "deepseek-v4-lite",
  // apiKey:   "sk-...",
};

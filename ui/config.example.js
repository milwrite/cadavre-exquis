// Copy to config.local.js (gitignored) and edit. corpse.html reads window.CORPSE_CONFIG.
window.CORPSE_CONFIG = {
  // Local Ollama (OpenAI-compatible). No key needed for localhost.
  endpoint: "http://localhost:11434/v1/chat/completions",
  model:    "exquisite-corpse-tuned",   // or any gemma you've pulled
  apiKey:   "",

  // Hosted Ollama instead? Point the endpoint at it and set apiKey:
  // endpoint: "https://ollama.com/v1/chat/completions",
  // model:    "deepseek-v4-lite",
  // apiKey:   "sk-...",
};

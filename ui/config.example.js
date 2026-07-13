// Copy to config.local.js only when you need a local or private override.
// Published pages work without this file: they use the inference-arcade.com
// proxy and receive its model list from /api/cadavre/models.
window.CORPSE_CONFIG = {
  // Direct multi-LoRA vLLM connection for local play.
  endpoint: "http://127.0.0.1:1234/v1/chat/completions",
  readyEndpoint: "",
  model: "exquisite-corpse",

  // Leave this blank for one direct local vLLM choice. A configured catalog
  // returns { default, models: [{ id, label, provider, model, available }] }.
  // The selector sends each model's explicit id unchanged with chat requests.
  modelsEndpoint: "",

  // Local vLLM and the published proxy need no browser credential. If a
  // personal endpoint does, add it only to the gitignored config.local.js.
  apiKey: "",

  // Local Ollama after deploy/build_ollama_model.py --create:
  // endpoint: "http://localhost:11434/v1/chat/completions",
  // model: "exquisite-corpse-tuned",
};

// Leave config.local.js absent on published sites. Their built-in defaults are:
//   chat:   https://inference-arcade.com/api/cadavre/chat
//   ready:  https://inference-arcade.com/api/cadavre/ready
//   models: https://inference-arcade.com/api/cadavre/models
// Provider credentials belong to that server-side proxy. They never belong in
// page source, URLs, browser storage, console output, or this example.

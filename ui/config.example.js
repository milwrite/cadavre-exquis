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
  // model:    "deepseek-v4-flash",
  // apiKey:   "sk-...",
};

// ── Serving BOTH the UI and the model behind one origin ──────────────────────
// If a reverse proxy (e.g. `tailscale serve`, nginx, Cloudflare Tunnel) exposes
// this page AND the vLLM host under the same origin — the page at `/`, the API
// at `/v1` — use an origin-aware config so one file works both on the box and
// remotely, with no CORS and no hardcoded hostname. Replace the block above with:
//
// (function () {
//   var onBox = ["localhost", "127.0.0.1", ""].indexOf(location.hostname) !== -1;
//   window.CORPSE_CONFIG = {
//     endpoint: onBox
//       ? "http://127.0.0.1:1234/v1/chat/completions"  // opened on the box: hit vLLM directly
//       : location.origin + "/v1/chat/completions",     // served via proxy: same-origin /v1
//     model:  "exquisite-corpse",
//     apiKey: "",
//   };
// })();
//
// Keep this in config.local.js (gitignored) — never in a committed file: on
// GitHub Pages location.origin is *.github.io, which has no /v1, so it would
// break the bring-your-own-local-model flow. That is why the pages 404 on a
// missing config.local.js and fall back to the localhost default above.

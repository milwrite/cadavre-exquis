# cail-cadavre — the game as one Cloudflare Worker

Exquisite Corpse on the CUNY AI Lab account: both play surfaces served as
static assets, the model routes in front of **Workers AI on the lab's own
account** (no provider key), and the shared wall in a SQLite-backed Durable
Object. Preview: https://cail-cadavre.ailab-452.workers.dev

```
browser ──► cail-cadavre Worker ──► env.AI (Workers AI, lab account)
             ├─ /               the parlor           (dist/index.html)
             ├─ /wall.html      the wall             (dist/wall.html)
             ├─ /ui/corpse      the open sheet       (dist/ui/corpse.html)
             ├─ /ui/config.local.js   points both pages at the routes below
             ├─ /api/cadavre/models   catalog drawn from the CAIL Gateway's public /v1/catalog
             ├─ /api/cadavre/ready    one tiny generation verifies a route
             ├─ /api/cadavre/chat     OpenAI-shaped, never streamed, budgets clamped
             ├─ /api/cadavre/wall     pins, votes, rename, removal (Durable Object SQLite)
             └─ /health
```

## Commands

```bash
cd worker
npm install
npm run check      # build dist/, wrangler types, tsc
npm test           # node --test on the pure modules (policy, catalog, shape)
npm run dev        # http://127.0.0.1:8787 — the AI binding is always remote (real usage)
npm run deploy     # check + test + wrangler deploy, RELEASE = short git sha
```

`wrangler.jsonc` pins `account_id` to the CUNY AI Lab account and the name
`cail-cadavre`; `workers_dev` is the only trigger, so no zone, route, or other
Worker is touched. Deleting the Worker deletes its Durable Object with it.

## How the pieces fit

- **`src/policy.ts`** decides what the menu offers. `EXCLUDE` drops safety
  classifiers, code models, LoRA bases, and the routes that failed the
  2026-09-02 fold probe (hidden or leaked reasoning at an 80-token budget).
  `ALLOW`, when non-empty, pins a short classroom list. This is the file to
  edit when the menu should change.
- **`src/catalog.ts`** fetches the gateway's public catalog (5-minute memory
  cache, stale-on-error, small built-in fallback) and maps it to the page shape
  `{ default, models: [{ id, label, provider, model, available, reasoning }] }`.
- **`src/shape.ts`** validates a page request: model must be in the catalog,
  messages bounded (12 messages, 12k chars), `max_tokens` clamped to 400
  (default 120), only `temperature`/`top_p` pass through, and reasoning routes
  get thinking switched off (`chat_template_kwargs.enable_thinking=false` for
  Workers AI, `reasoning.enabled=false` for OpenRouter).
- **`src/inference.ts`** runs `@cf/` routes on the AI binding and anything else
  through the CAIL Gateway with `CAIL_GATEWAY_KEY` (a secret; only needed when
  `CADAVRE_MODEL_POLICY=all`). Set `AI_GATEWAY_ID` to log binding calls in an
  AI Gateway on this account.
- **`src/store.ts`** is the Durable Object: `pins`, `votes`, and a `spend`
  ledger. Chat reserves `max_tokens` against `CADAVRE_DAILY_TOKEN_CEILING`
  before generating and settles to actual usage after.
- **Rate limits** (Workers Rate Limiting, keyed by `cf-connecting-ip`):
  20 turns/min, 6 readings/min, 5 pins/min. Counters are shared account-wide by
  `namespace_id`, so the ids are deliberately unusual and every key is prefixed
  `cadavre:`.

## Not yet

- Turnstile-backed sessions (needs the lab's widget secret).
- A CUNY Login front door, if the lab decides anonymous play should not spend.
- A delegated `ailab.gc.cuny.edu` hostname; `workers.dev` is the preview.

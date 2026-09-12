import { atWorkerOrigin, type WorkerOriginBindings } from "./worker-origin.ts";
/* cail-cadavre: Exquisite Corpse as one Worker on the CUNY AI Lab account.
 *
 *   GET  /                          the parlor (static asset)
 *   GET  /wall.html                 the wall (static asset)
 *   GET  /ui/corpse.html            the open sheet (static asset)
 *   GET  /ui/config.local.js        points both pages at the routes below
 *   GET  /api/cadavre/models        { default, models: [route] }
 *   POST /api/cadavre/ready         { model } -> { ready, model, provider }
 *   POST /api/cadavre/chat          OpenAI-shaped, never streamed
 *   GET  /api/cadavre/wall          ?limit&cursor -> { items, nextCursor }
 *   POST /api/cadavre/wall          { name, title, poem, analysis } -> { item, deleteToken }
 *   POST /api/cadavre/wall/:id/remove   { deleteToken }
 *   POST /api/cadavre/wall/:id/rename   { deleteToken, name } -> { renamed, name }
 *   POST /api/cadavre/wall/:id/edit     { deleteToken, poem?, analysis?, title? } -> { edited, poem, analysis, title }
 *   POST /api/cadavre/wall/:id/vote     { voterToken, value } -> counts + viewerVote
 *   GET  /health
 */
import { signedIn, type SignedBindings } from "./signed-in.ts";
import { Hono } from "hono";
import { fetchGatewayModels, findRoute, toCatalog, type Catalog } from "./catalog.ts";
import { configScript } from "./config.ts";
import { runOnBinding, runOnGateway, UpstreamError } from "./inference.ts";
import { policyFromEnv } from "./policy.ts";
import { BadRequest, completionEnvelope, prepareChatBody, type ChatRequest } from "./shape.ts";
import { WALL_LIMITS, type CadavreStore } from "./store.ts";
import { ensureReady, requestForRoute, RouteHealth, withFallback } from './routes.ts';

export { CadavreStore } from "./store.ts";

// CAIL_GATEWAY_KEY is a secret (wrangler secret put), so it is absent from the generated Env.
type Bindings = Env & { STORE: DurableObjectNamespace<CadavreStore>; CAIL_GATEWAY_KEY?: string };
const app = new Hono<{ Bindings: Bindings }>();

const routeHealth = new RouteHealth();

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function visitor(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || "unknown";
}

function store(env: Bindings) {
  return env.STORE.get(env.STORE.idFromName("cadavre"));
}

async function catalogFor(env: Bindings): Promise<Catalog> {
  const models = await fetchGatewayModels(env.CAIL_CATALOG_URL);
  return toCatalog(models, env.CADAVRE_DEFAULT_MODEL, policyFromEnv(env.CADAVRE_MODEL_POLICY, Boolean(env.CAIL_GATEWAY_KEY)));
}

async function complete(env: Bindings, route: ReturnType<typeof findRoute> & object, request: ChatRequest, signal?: AbortSignal) {
  if (route.provider === "workers-ai") return runOnBinding(env.AI, route, request, env.AI_GATEWAY_ID, 45_000, signal);
  return runOnGateway(env.CAIL_GATEWAY_URL, env.CAIL_GATEWAY_KEY ?? "", route, request, 55_000, signal);
}

async function meteredCompletion(env: Bindings, route: ReturnType<typeof findRoute> & object, request: ChatRequest, signal?: AbortSignal) {
  const day = today();
  const ledger = store(env);
  const reservation = await ledger.reserveSpend(day, request.max_tokens, Number(env.CADAVRE_DAILY_TOKEN_CEILING) || 0);
  if (!reservation.allowed) throw new UpstreamError("the parlor has spent today's budget; play resumes tomorrow", 429);
  // Failed and timed-out requests may still incur usage. Keep the reservation
  // unless the provider reports actual usage, then settle before returning.
  const result = await complete(env, route, request, signal);
  await ledger.settleSpend(day, request.max_tokens, result.usage.completion_tokens ?? request.max_tokens);
  return result;
}

async function limited(limiter: RateLimit, key: string): Promise<boolean> {
  const { success } = await limiter.limit({ key: `cadavre:${key}` });
  return !success;
}

// -- pages ------------------------------------------------------------------

app.get("/health", async (c) => {
  const catalog = await catalogFor(c.env);
  return c.json({
    ok: true,
    release: c.env.RELEASE,
    env: c.env.CAIL_LOG_ENV,
    inference: "workers-ai binding" + (c.env.AI_GATEWAY_ID ? ` via AI Gateway ${c.env.AI_GATEWAY_ID}` : ""),
    gatewayKey: Boolean(c.env.CAIL_GATEWAY_KEY),
    policy: c.env.CADAVRE_MODEL_POLICY,
    models: catalog.models.length,
    default: catalog.default,
    spentToday: await store(c.env).spendToday(today()),
    ceiling: Number(c.env.CADAVRE_DAILY_TOKEN_CEILING),
  }, 200, noStore);
});

app.get("/ui/config.local.js", async (c) => {
  const catalog = await catalogFor(c.env);
  return c.body(configScript(catalog.default), 200, {
    ...noStore,
    "Content-Type": "application/javascript; charset=utf-8",
  });
});

// -- model routes -------------------------------------------------------------

app.get("/api/cadavre/models", async (c) => c.json(routeHealth.annotate(await catalogFor(c.env)), 200, noStore));

app.post("/api/cadavre/ready", async (c) => {
  const catalog = await catalogFor(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { model?: unknown };
  const model = String(body.model || catalog.default || "").trim();
  const route = findRoute(catalog, model);
  if (!route) return c.json({ ready: false, model, error: "not in the CAIL Gateway catalog" }, 404, noStore);

  if (await limited(c.env.TURN_LIMIT, `turn:${visitor(c)}`)) {
    return c.json({ ready: false, model, error: "too many requests; wait a minute" }, 429, noStore);
  }
  try {
    const verdict = await ensureReady(routeHealth, catalog, model, (candidate, body, signal) => meteredCompletion(c.env, candidate, body, signal), c.req.raw.signal);
    return c.json({ ready: true, model: verdict.route.id, provider: verdict.route.provider, cached: verdict.result.cached, failover: verdict.failover }, 200, noStore);
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "probe failed";
    return c.json({ ready: false, model, error: message }, 503, noStore);
  }
});

app.post("/api/cadavre/chat", async (c) => {
  const catalog = await catalogFor(c.env);
  let shaped;
  try {
    shaped = prepareChatBody(await c.req.json().catch(() => null), catalog);
  } catch (err) {
    const message = err instanceof BadRequest ? err.message : "bad request";
    return c.json({ error: { message } }, 400, noStore);
  }
  const { route, request } = shaped;
  const who = visitor(c);
  // The parlor asks 80 tokens for a fold and 400 for the close reading.
  const limiter = request.max_tokens > 160 ? c.env.READING_LIMIT : c.env.TURN_LIMIT;
  if (await limited(limiter, `${request.max_tokens > 160 ? "reading" : "turn"}:${who}`)) {
    return c.json({ error: { message: "too many requests; the table needs a minute" } }, 429, noStore);
  }

  try {
    const verdict = await withFallback(routeHealth, catalog, route.id, async (candidate, signal) => {
      const body = requestForRoute(request, candidate);
      return meteredCompletion(c.env, candidate, body, signal);
    }, { signal: c.req.raw.signal });
    const { result } = verdict;
    return c.json({ ...completionEnvelope(verdict.route, result.content, result.usage, result.finishReason), failover: verdict.failover, requestedModel: route.id }, 200, noStore);
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    const message = err instanceof UpstreamError ? err.message : "model call failed";
    console.error("chat failed", route.id, message);
    return c.json({ error: { message } }, status as 502, noStore);
  }
});

// -- the wall -----------------------------------------------------------------

app.get("/api/cadavre/wall", async (c) => {
  const limit = Number(c.req.query("limit")) || WALL_LIMITS.page;
  const cursor = c.req.query("cursor") || null;
  return c.json(await store(c.env).listPins(limit, cursor), 200, noStore);
});

app.post("/api/cadavre/wall", async (c) => {
  if (await limited(c.env.WALL_LIMIT, `wall:${visitor(c)}`)) {
    return c.json({ error: "too many pins from this table; wait a minute" }, 429, noStore);
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return c.json({ error: "send a JSON object" }, 400, noStore);
  const result = await store(c.env).pin(body);
  if ("error" in result) return c.json(result, 400, noStore);
  return c.json(result, 201, noStore);
});

app.post("/api/cadavre/wall/:id/remove", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { deleteToken?: unknown };
  const outcome = await store(c.env).removePin(c.req.param("id"), body.deleteToken);
  if (outcome === "missing") return c.json({ error: "that corpse is no longer on the wall" }, 404, noStore);
  if (outcome === "forbidden") return c.json({ error: "only the hand that pinned it may remove it" }, 403, noStore);
  return c.json({ removed: true }, 200, noStore);
});

app.post("/api/cadavre/wall/:id/rename", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { deleteToken?: unknown; name?: unknown };
  const outcome = await store(c.env).renamePin(c.req.param("id"), body.deleteToken, body.name);
  if (outcome === "missing") return c.json({ error: "that corpse is no longer on the wall" }, 404, noStore);
  if (outcome === "forbidden") return c.json({ error: "only the hand that pinned it may rename it" }, 403, noStore);
  if (outcome === "invalid") return c.json({ error: "give the pin a name" }, 400, noStore);
  return c.json({ renamed: true, name: outcome.name }, 200, noStore);
});

app.post("/api/cadavre/wall/:id/edit", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { deleteToken?: unknown; poem?: unknown; analysis?: unknown; title?: unknown };
  const outcome = await store(c.env).editPin(c.req.param("id"), body.deleteToken, body);
  if (outcome === "missing") return c.json({ error: "that corpse is no longer on the wall" }, 404, noStore);
  if (outcome === "forbidden") return c.json({ error: "only the hand that pinned it may edit it" }, 403, noStore);
  if (outcome === "invalid") return c.json({ error: "a corpse needs at least one line" }, 400, noStore);
  return c.json({ edited: true, ...outcome }, 200, noStore);
});

app.post("/api/cadavre/wall/:id/vote", async (c) => {
  if (await limited(c.env.TURN_LIMIT, `vote:${visitor(c)}`)) {
    return c.json({ error: "too many votes; wait a minute" }, 429, noStore);
  }
  const body = (await c.req.json().catch(() => ({}))) as { voterToken?: unknown; value?: unknown };
  const result = await store(c.env).vote(c.req.param("id"), body.voterToken, body.value);
  if (!result) return c.json({ error: "the vote could not be saved" }, 400, noStore);
  return c.json(result, 200, noStore);
});

app.all("/api/*", (c) => c.json({ error: { message: "no such route" } }, 404, noStore));
app.notFound((c) => c.text("not found", 404));

export default {
  async fetch(request: Request, env: Bindings & SignedBindings, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((env as WorkerOriginBindings).PUBLIC_ORIGIN === new URL(request.url).origin) return atWorkerOrigin(request, env as WorkerOriginBindings, async r => app.fetch(r,env,ctx));
    if(path==='/health')await env.WORK_ACCOUNTS.register();
    if (path === "/cadavre" || path.startsWith("/cadavre/")) return signedIn(request, env, async (r) => app.fetch(r, env, ctx));
    return Promise.resolve(app.fetch(request, env, ctx));
  },
};

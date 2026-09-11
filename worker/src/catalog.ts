/* The page catalog: { default, models: [route] }, drawn from the CAIL Gateway's
 * public /v1/catalog and narrowed by policy. Cached in isolate memory; a stale
 * copy or a small built-in list covers a catalog outage. */
import { selectModels, type GatewayModel, type Policy } from "./policy.ts";
import { GAME_MODELS, gameModel } from './game-models.ts';

export type Route = {
  id: string;
  label: string;
  provider: string;
  model: string;
  available: boolean;
  reasoning: boolean;
  group?: string;
};

export type Catalog = { default: string; models: Route[] };

export const CATALOG_TTL_MS = 5 * 60 * 1000;
export const USER_AGENT = "cail-cadavre/0.1 (+https://github.com/milwrite/cadavre-exquis)";

// CAIL's public ids are aliases, not identifiers accepted by AI.run().
// Verified against `wrangler ai models list` on 2026-09-11. Never guess an
// upstream namespace for a new catalog entry: unresolved aliases stay hidden.
const BINDING_MODELS = [
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/qwen/qwen3.8-27b",
  "@cf/zai-org/glm-5.2",
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/nvidia/nemotron-3-120b-a12b",
];

export function bindingModel(id: string): string | undefined {
  if (id.startsWith("@cf/")) return id;
  return BINDING_MODELS.find(model => model.slice(model.lastIndexOf("/") + 1) === id);
}

// Used only when the catalog cannot be fetched and nothing is cached yet.
export const FALLBACK_MODELS: GatewayModel[] = GAME_MODELS.filter(m => m.provider === 'workers-ai').map(m => ({
  id: m.id, provider: m.provider, capabilities: ['text-generation', ...(m.id.startsWith('llama-') ? [] : ['reasoning'])],
}));

export function routeLabel(id: string): string {
  return id.startsWith("@cf/") ? id.slice(4) : id;
}

export function toCatalog(models: GatewayModel[], defaultModel: string, policy: Policy): Catalog {
  const routes: Route[] = [];
  const seen = new Set<string>();
  for (const m of selectModels(models, policy).sort((a,b) => GAME_MODELS.findIndex(m => m.id === gameModel(a.id)?.id) - GAME_MODELS.findIndex(m => m.id === gameModel(b.id)?.id))) {
    const id = String(m.id).trim();
    const model = m.provider === "workers-ai" ? bindingModel(id) : id;
    if (!model) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    routes.push({
      id,
      label: gameModel(id)?.label || routeLabel(id),
      provider: m.provider || "cloudflare-ai-gateway",
      model,
      available: true,
      reasoning: (m.capabilities ?? []).includes("reasoning"),
      group: gameModel(id)?.group,
    });
  }
  const preferred = routes.find(r => r.id === defaultModel || r.model === defaultModel);
  return { default: preferred?.id ?? routes[0]?.id ?? "", models: routes };
}

export function findRoute(catalog: Catalog, model: string): Route | undefined {
  return catalog.models.find((r) => r.id === model || r.model === model);
}

let cached: { at: number; models: GatewayModel[] } | null = null;

export async function fetchGatewayModels(url: string, signal?: AbortSignal): Promise<GatewayModel[]> {
  const now = Date.now();
  if (cached && now - cached.at < CATALOG_TTL_MS) return cached.models;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`catalog returned ${res.status}`);
    const data = (await res.json()) as { data?: GatewayModel[]; models?: GatewayModel[] };
    const models = data.data ?? data.models ?? [];
    if (!Array.isArray(models) || models.length === 0) throw new Error("catalog was empty");
    cached = { at: now, models };
    return models;
  } catch (err) {
    if (cached) return cached.models;          // stale beats empty
    console.warn("catalog unavailable, using built-in list:", (err as Error).message);
    return FALLBACK_MODELS;
  }
}

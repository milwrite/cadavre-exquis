/* The page catalog: { default, models: [route] }, drawn from the CAIL Gateway's
 * public /v1/catalog and narrowed by policy. Cached in isolate memory; a stale
 * copy or a small built-in list covers a catalog outage. */
import { selectModels, type GatewayModel, type Policy } from "./policy.ts";

export type Route = {
  id: string;
  label: string;
  provider: string;
  model: string;
  available: boolean;
  reasoning: boolean;
};

export type Catalog = { default: string; models: Route[] };

export const CATALOG_TTL_MS = 5 * 60 * 1000;
export const USER_AGENT = "cail-cadavre/0.1 (+https://github.com/milwrite/cadavre-exquis)";

// Used only when the catalog cannot be fetched and nothing is cached yet.
export const FALLBACK_MODELS: GatewayModel[] = [
  { id: "@cf/deepseek-ai/deepseek-v4-flash-0731", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
  { id: "@cf/google/gemma-4-26b-a4b-it", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", provider: "workers-ai", capabilities: ["text-generation"] },
];

export function routeLabel(id: string): string {
  return id.startsWith("@cf/") ? id.slice(4) : id;
}

export function toCatalog(models: GatewayModel[], defaultModel: string, policy: Policy): Catalog {
  const routes: Route[] = [];
  const seen = new Set<string>();
  for (const m of selectModels(models, policy)) {
    const id = String(m.id).trim();
    if (seen.has(id)) continue;
    seen.add(id);
    routes.push({
      id,
      label: routeLabel(id),
      provider: m.provider || "cloudflare-ai-gateway",
      model: id,
      available: true,
      reasoning: (m.capabilities ?? []).includes("reasoning"),
    });
  }
  const ids = routes.map((r) => r.id);
  const fallback = ids[0] ?? "";
  return { default: ids.includes(defaultModel) ? defaultModel : fallback, models: routes };
}

export function findRoute(catalog: Catalog, model: string): Route | undefined {
  return catalog.models.find((r) => r.id === model);
}

let cached: { at: number; models: GatewayModel[] } | null = null;

export async function fetchGatewayModels(url: string, signal?: AbortSignal): Promise<GatewayModel[]> {
  const now = Date.now();
  if (cached && now - cached.at < CATALOG_TTL_MS) return cached.models;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal,
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

/* Retry only model failures, within the caller's existing catalog and access.
 * Public health is short-lived isolate memory. Signed-in calls use a fresh
 * instance so one person's access or quota cannot affect another's choices. */
import { findRoute, type Catalog, type Route } from './catalog.ts';
import { generationBudget } from './game-models.ts';
import { UpstreamError } from './inference.ts';
import { THINKING_OFF, type ChatRequest } from './shape.ts';

export const READY_TTL_MS = 10 * 60_000;
export const FAILED_TTL_MS = 2 * 60_000;
export const TURN_TIMEOUT_MS = 24_000;
export const PROBE_TIMEOUT_MS = 8_000;

export function retryable(error: unknown): error is UpstreamError {
  // Authentication, admission, validation, rate and budget failures stop here.
  return error instanceof UpstreamError && (error.status === 404 || error.status >= 500);
}

export class RouteHealth {
  private ready = new Map<string, number>();
  private failed = new Map<string, number>();
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  isReady(id: string) { const at = this.ready.get(id); return at !== undefined && this.now() - at < READY_TTL_MS; }
  isFailed(id: string) { const at = this.failed.get(id); return at !== undefined && this.now() - at < FAILED_TTL_MS; }
  markReady(id: string) { this.failed.delete(id); this.ready.set(id, this.now()); }
  markFailed(id: string) { this.ready.delete(id); this.failed.set(id, this.now()); }
  candidates(catalog: Catalog, requested: string): Route[] {
    const selected = findRoute(catalog, requested);
    if (!selected) return [];
    const order = [selected, ...catalog.models.filter(r => this.isReady(r.id)), findRoute(catalog, catalog.default), ...catalog.models];
    const seen = new Set<string>();
    return order.filter((route): route is Route => {
      if (!route || !route.available || this.isFailed(route.id) || seen.has(route.model)) return false;
      seen.add(route.model);
      return true;
    });
  }
  annotate(catalog: Catalog): Catalog {
    const models = catalog.models.map(route => ({ ...route, available: route.available && !this.isFailed(route.id) }));
    const preferred = models.find(route => route.id === catalog.default && route.available);
    return { default: preferred?.id ?? models.find(route => route.available && this.isReady(route.id))?.id ?? models.find(route => route.available)?.id ?? catalog.default, models };
  }
}

export function requestForRoute(request: ChatRequest, route: Route): ChatRequest {
  if (request.model === route.id || request.model === route.model) {
    return { ...(route.reasoning ? THINKING_OFF[route.provider] : {}), ...request, model: route.id, max_tokens: generationBudget(route.id, request.max_tokens) };
  }
  const { reasoning: _reasoning, chat_template_kwargs: _template, ...body } = request;
  return { ...body, model: route.id, max_tokens: generationBudget(route.id, request.max_tokens), ...(route.reasoning ? THINKING_OFF[route.provider] : {}) };
}

type Runner<T> = (route: Route, signal: AbortSignal) => Promise<T>;

async function boundedAttempt<T>(run: Runner<T>, route: Route, parent: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new UpstreamError('The model took too long to answer.', 504)), timeoutMs);
  let rejectOnAbort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    const cancelled = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(signal.reason);
      signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
    // The timeout both ends the wait AND aborts the actual provider request.
    return await Promise.race([run(route, signal), cancelled]);
  } finally {
    clearTimeout(timer);
    if (rejectOnAbort) signal.removeEventListener('abort', rejectOnAbort);
  }
}

export async function withFallback<T>(
  health: RouteHealth, catalog: Catalog, requested: string, run: Runner<T>,
  { signal, maxAttempts = 2, timeoutMs = TURN_TIMEOUT_MS, totalMs = 50_000 }: { signal?: AbortSignal; maxAttempts?: number; timeoutMs?: number; totalMs?: number } = {},
): Promise<{ route: Route; result: T; failover: boolean; tried: string[] }> {
  const selected = findRoute(catalog, requested);
  if (!selected) throw new UpstreamError('This model is not in the game catalog.', 404);
  const deadline = Date.now() + totalMs;
  const tried: string[] = [];
  let lastError: unknown = new UpstreamError('The game models are reconnecting. Try again shortly.', 503);
  for (const route of health.candidates(catalog, requested).slice(0, maxAttempts)) {
    signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    tried.push(route.id);
    try {
      const result = await boundedAttempt(run, route, signal, Math.min(timeoutMs, remaining));
      health.markReady(route.id);
      return { route, result, failover: route.id !== selected.id, tried };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (!retryable(error)) throw error;
      health.markFailed(route.id);
      lastError = error;
    }
  }
  throw lastError;
}

export async function ensureReady(health: RouteHealth, catalog: Catalog, requested: string, run: (route: Route, body: ChatRequest, signal: AbortSignal) => Promise<{content: string}>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const first = health.candidates(catalog, requested)[0];
  if (first && health.isReady(first.id)) return { route: first, result: { cached: true }, failover: first.id !== findRoute(catalog, requested)?.id, tried: [] };
  return withFallback(health, catalog, requested, async (route, attemptSignal) => {
    if (health.isReady(route.id)) return { cached: true };
    const body = requestForRoute({ model: route.id, messages: [{ role: 'system', content: 'Reply with one word.' }, { role: 'user', content: 'ready?' }], temperature: 0, max_tokens: 8 }, route);
    const result = await run(route, body, attemptSignal);
    if (!result.content?.trim()) throw new UpstreamError('The model returned no visible text.', 502);
    return { cached: false };
  }, { signal, maxAttempts: 3, timeoutMs: PROBE_TIMEOUT_MS, totalMs: 25_000 });
}

import type { Catalog, Route } from './catalog.ts';
import { gameModel } from './game-models.ts';
import { UpstreamError } from './inference.ts';
import { requestForRoute, RouteHealth, withFallback } from './routes.ts';
import type { ChatRequest } from './shape.ts';

export class GatewayFailure extends UpstreamError {
  response: Response;
  constructor(response: Response) {
    super(`The model gateway returned ${response.status}.`, response.status);
    this.response = response;
  }
}

type Gateway = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type CompletionData = { model?: string; choices?: { message?: { content?: string } }[]; [key: string]: unknown };
const ORIGIN = 'https://tools.ailab.gc.cuny.edu';

export async function signedCompletion(gateway: Gateway, jwt: string, catalog: Catalog, route: Route, body: ChatRequest, signal: AbortSignal) {
  // No shared cooldown here: personal access and account quotas are private.
  return withFallback(new RouteHealth(), catalog, route.id, async (candidate, attemptSignal) => {
    const response = await gateway.fetch(ORIGIN + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}`, 'x-request-id': crypto.randomUUID() },
      body: JSON.stringify({ ...requestForRoute(body, candidate), stream: false }),
      signal: attemptSignal,
    }).catch(error => {
      if (attemptSignal.aborted) throw attemptSignal.reason;
      throw new UpstreamError('The model gateway could not be reached.', 502);
    });
    if (!response.ok) throw new GatewayFailure(response);
    let data: CompletionData;
    try { data = await response.json() as CompletionData; }
    catch { throw new UpstreamError('The model gateway returned an invalid response.', 502); }
    if (!data.choices?.[0]?.message?.content?.trim()) throw new UpstreamError('The model returned no visible text.', 502);
    // Attribute the provider actually reported by the gateway, including its
    // own fallback, rather than attributing the requested route by assumption.
    return { ...data, model: gameModel(data.model || candidate.id)?.id || data.model || candidate.id };
  }, { signal });
}

/* Two ways to run a route. @cf/ models run on the Worker's AI binding, billed
 * to the lab account with no key at all. Anything else goes to the CAIL Gateway
 * with an app-class key held as a Worker secret. Both return the same shape. */
import type { Route } from "./catalog.ts";
import { USER_AGENT } from "./catalog.ts";
import { pickContent, pickUsage, type ChatRequest, type Usage } from "./shape.ts";

export type Completion = { content: string; usage: Usage; finishReason: string };

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function runOnBinding(ai: Ai, route: Route, request: ChatRequest, gatewayId = "", timeoutMs = 45_000, signal?: AbortSignal): Promise<Completion> {
  const { model: _model, ...inputs } = request;
  const options = {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    ...(gatewayId ? { gateway: { id: gatewayId, skipCache: true } } : {}),
  };
  let result: unknown;
  try {
    // The binding's input type is per-model; the catalog already vetted the id.
    result = await ai.run(route.model as Parameters<Ai["run"]>[0], inputs as never, options as never);
  } catch (err) {
    throw new UpstreamError(`Workers AI: ${(err as Error).message}`, 502);
  }
  const choices = ((result ?? {}) as { choices?: Array<{ finish_reason?: string }> }).choices;
  const content = pickContent(result);
  if (!content) throw new UpstreamError("The model returned no visible text. Try another model.", 502);
  return {
    content,
    usage: pickUsage(result),
    finishReason: choices?.[0]?.finish_reason ?? "stop",
  };
}

export async function runOnGateway(
  baseUrl: string,
  key: string,
  route: Route,
  request: ChatRequest,
  timeoutMs = 55_000,
  signal?: AbortSignal,
): Promise<Completion> {
  if (!key) throw new UpstreamError(`route ${route.id} needs CAIL_GATEWAY_KEY`, 503);
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ ...request, stream: false }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`CAIL Gateway unreachable: ${(err as Error).message}`, 502);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const detail = (data as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    throw new UpstreamError(`CAIL Gateway returned ${res.status}: ${detail}`, res.status >= 500 ? 502 : res.status);
  }
  const choices = ((data ?? {}) as { choices?: Array<{ finish_reason?: string }> }).choices;
  if (!choices?.length) throw new UpstreamError("CAIL Gateway answered without choices", 502);
  const content = pickContent(data);
  if (!content) throw new UpstreamError("The model returned no visible text. Try another model.", 502);
  return { content, usage: pickUsage(data), finishReason: choices[0]?.finish_reason ?? "stop" };
}

/* Validate a page chat request against the catalog and shape it for the model.
 * The Worker is public, so only a known allowlist of fields passes through,
 * budgets are clamped server-side, and reasoning models get thinking switched
 * off so the whole (small) budget goes to the visible line. */
import type { Catalog, Route } from "./catalog.ts";
import { findRoute } from "./catalog.ts";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  chat_template_kwargs?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type Limits = {
  maxTokens: number;       // hard ceiling per request
  defaultTokens: number;   // when the page sends none (the open sheet)
  maxMessages: number;
  maxChars: number;        // total content across messages
};

export const LIMITS: Limits = { maxTokens: 400, defaultTokens: 120, maxMessages: 12, maxChars: 12000 };

// Verified through the gateway 2026-09-02: each provider family has its own switch.
export const THINKING_OFF: Record<string, Partial<ChatRequest>> = {
  "workers-ai": { chat_template_kwargs: { enable_thinking: false } },
  openrouter: { reasoning: { enabled: false } },
};

export class BadRequest extends Error {}

const ROLES = new Set(["system", "user", "assistant"]);

function clamp(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function prepareChatBody(
  body: unknown,
  catalog: Catalog,
  limits: Limits = LIMITS,
): { route: Route; request: ChatRequest } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequest("request body must be a JSON object");
  }
  const raw = body as Record<string, unknown>;
  const model = String(raw.model || catalog.default || "").trim();
  const route = findRoute(catalog, model);
  if (!route) throw new BadRequest(`model "${model}" is not offered by the CAIL Gateway catalog`);

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    throw new BadRequest("messages must be a non-empty array");
  }
  if (raw.messages.length > limits.maxMessages) {
    throw new BadRequest(`at most ${limits.maxMessages} messages per turn`);
  }
  let chars = 0;
  const messages: ChatMessage[] = raw.messages.map((entry) => {
    const m = (entry ?? {}) as Record<string, unknown>;
    if (!ROLES.has(String(m.role)) || typeof m.content !== "string") {
      throw new BadRequest("each message needs a role and string content");
    }
    chars += m.content.length;
    return { role: m.role as ChatMessage["role"], content: m.content };
  });
  if (chars > limits.maxChars) throw new BadRequest(`messages exceed ${limits.maxChars} characters`);

  const request: ChatRequest = {
    model: route.id,
    messages,
    max_tokens: Math.round(clamp(raw.max_tokens, 1, limits.maxTokens, limits.defaultTokens)),
  };
  if (raw.temperature !== undefined) request.temperature = clamp(raw.temperature, 0, 2, 0.8);
  if (raw.top_p !== undefined) request.top_p = clamp(raw.top_p, 0, 1, 0.95);

  if (route.reasoning) {
    const off = THINKING_OFF[route.provider] ?? {};
    if (off.chat_template_kwargs && !raw.chat_template_kwargs) request.chat_template_kwargs = off.chat_template_kwargs;
    if (off.reasoning && !raw.reasoning) request.reasoning = off.reasoning;
    // A caller's own reasoning setting is honoured, but only these two keys.
    if (raw.chat_template_kwargs && typeof raw.chat_template_kwargs === "object") {
      request.chat_template_kwargs = raw.chat_template_kwargs as Record<string, unknown>;
    }
    if (raw.reasoning && typeof raw.reasoning === "object") {
      request.reasoning = raw.reasoning as Record<string, unknown>;
    }
  }
  return { route, request };
}

export type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

/** What both pages read: model, provider, choices[0].message.content. */
export function completionEnvelope(route: Route, content: string, usage: Usage = {}, finishReason = "stop") {
  return {
    id: `cadavre-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: route.id,
    provider: route.provider,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage,
  };
}

/** Workers AI answers either OpenAI-style (choices) or the older { response }. */
export function pickContent(result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  const choices = r.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const fromChoices = choices?.[0]?.message?.content;
  if (typeof fromChoices === "string") return fromChoices.trim();
  if (typeof r.response === "string") return r.response.trim();
  return "";
}

export function pickUsage(result: unknown): Usage {
  const usage = ((result ?? {}) as Record<string, unknown>).usage as Usage | undefined;
  if (!usage || typeof usage !== "object") return {};
  const out: Usage = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"] as const) {
    if (typeof usage[key] === "number") out[key] = usage[key];
  }
  return out;
}

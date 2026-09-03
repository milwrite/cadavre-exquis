import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareChatBody, BadRequest, pickContent, pickUsage, LIMITS } from "../src/shape.ts";
import type { Catalog } from "../src/catalog.ts";

const catalog: Catalog = {
  default: "@cf/google/gemma-4-26b-a4b-it",
  models: [
    { id: "@cf/google/gemma-4-26b-a4b-it", label: "g", provider: "workers-ai", model: "@cf/google/gemma-4-26b-a4b-it", available: true, reasoning: true },
    { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "l", provider: "workers-ai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", available: true, reasoning: false },
    { id: "deepseek/deepseek-chat-v3.1", label: "d", provider: "openrouter", model: "deepseek/deepseek-chat-v3.1", available: true, reasoning: true },
  ],
};
const messages = [{ role: "system", content: "play" }, { role: "user", content: "the velvet" }];

test("foreign models are refused", () => {
  assert.throws(() => prepareChatBody({ model: "ollama:kimi-k2.5", messages }, catalog), BadRequest);
  assert.throws(() => prepareChatBody("nope", catalog), BadRequest);
});

test("budgets are clamped and unknown fields dropped", () => {
  const { request } = prepareChatBody(
    { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages, max_tokens: 9000, temperature: 0.8, stream: true, tools: [{}] },
    catalog,
  );
  assert.equal(request.max_tokens, LIMITS.maxTokens);
  assert.equal(request.temperature, 0.8);
  assert.ok(!("stream" in request));
  assert.ok(!("tools" in request));
  const { request: bare } = prepareChatBody({ messages }, catalog);
  assert.equal(bare.model, catalog.default);
  assert.equal(bare.max_tokens, LIMITS.defaultTokens);
});

test("thinking is switched off per provider, only for reasoning routes", () => {
  const cf = prepareChatBody({ model: "@cf/google/gemma-4-26b-a4b-it", messages, max_tokens: 80 }, catalog).request;
  assert.deepEqual(cf.chat_template_kwargs, { enable_thinking: false });
  assert.equal(cf.reasoning, undefined);
  const or = prepareChatBody({ model: "deepseek/deepseek-chat-v3.1", messages, max_tokens: 80 }, catalog).request;
  assert.deepEqual(or.reasoning, { enabled: false });
  assert.equal(or.chat_template_kwargs, undefined);
  const plain = prepareChatBody({ model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages }, catalog).request;
  assert.equal(plain.chat_template_kwargs, undefined);
});

test("a caller's own reasoning setting survives", () => {
  const req = prepareChatBody(
    { model: "@cf/google/gemma-4-26b-a4b-it", messages, chat_template_kwargs: { enable_thinking: true } },
    catalog,
  ).request;
  assert.deepEqual(req.chat_template_kwargs, { enable_thinking: true });
});

test("message shape and volume are bounded", () => {
  assert.throws(() => prepareChatBody({ messages: [] }, catalog), BadRequest);
  assert.throws(() => prepareChatBody({ messages: [{ role: "tool", content: "x" }] }, catalog), BadRequest);
  const many = Array.from({ length: LIMITS.maxMessages + 1 }, () => ({ role: "user", content: "x" }));
  assert.throws(() => prepareChatBody({ messages: many }, catalog), BadRequest);
  const huge = [{ role: "user", content: "x".repeat(LIMITS.maxChars + 1) }];
  assert.throws(() => prepareChatBody({ messages: huge }, catalog), BadRequest);
});

test("content and usage are read from either Workers AI answer shape", () => {
  assert.equal(pickContent({ choices: [{ message: { content: " curtains " } }] }), "curtains");
  assert.equal(pickContent({ response: "shadows swell\n" }), "shadows swell");
  assert.equal(pickContent({}), "");
  assert.deepEqual(pickUsage({ usage: { prompt_tokens: 10, completion_tokens: 3, extra: 1 } }), { prompt_tokens: 10, completion_tokens: 3 });
});

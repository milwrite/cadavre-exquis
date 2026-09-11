import { test } from "node:test";
import assert from "node:assert/strict";
import { toCatalog, routeLabel, findRoute } from "../src/catalog.ts";
import { policyFromEnv, selectModels, type GatewayModel } from "../src/policy.ts";

const models: GatewayModel[] = [
  { id: "@cf/google/gemma-4-26b-a4b-it", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/meta/llama-guard-3-8b", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/qwen/qwen2.5-coder-32b-instruct", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/google/gemma-2b-it-lora", provider: "workers-ai", capabilities: ["text-generation"] },
  { id: "@cf/meta/llama-3.2-11b-vision-instruct", provider: "workers-ai", modality: "multimodal", capabilities: ["text-generation"] },
  { id: "@cf/retired/model", provider: "workers-ai", status: "sunset", capabilities: ["text-generation"] },
  { id: "@cf/openai/whisper", provider: "workers-ai", capabilities: ["speech-to-text"] },
  { id: "deepseek/deepseek-chat-v3.1", provider: "openrouter", capabilities: ["text-generation", "reasoning"] },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", provider: "workers-ai", capabilities: ["text-generation"] },
];

test("workers-ai policy keeps only runnable @cf/ writers", () => {
  const kept = selectModels(models, policyFromEnv("workers-ai", false)).map((m) => m.id);
  assert.deepEqual(kept, [
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ]);
});

test("policy all adds OpenRouter only when a gateway key exists", () => {
  const without = selectModels(models, policyFromEnv("all", false)).map((m) => m.provider);
  assert.ok(!without.includes("openrouter"));
  const withKey = selectModels(models, policyFromEnv("all", true)).map((m) => m.id);
  assert.ok(withKey.includes("deepseek/deepseek-chat-v3.1"));
});

test("catalog dedups, labels, flags reasoning, and falls back on the default", () => {
  const catalog = toCatalog(models, "@cf/google/gemma-4-26b-a4b-it", policyFromEnv("workers-ai", false));
  assert.equal(catalog.models.length, 2);
  assert.equal(catalog.default, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(catalog.models[0]?.label, "google/gemma-4-26b-a4b-it");
  assert.equal(catalog.models[0]?.reasoning, true);
  assert.equal(catalog.models[1]?.reasoning, false);
  assert.ok(catalog.models.every((r) => r.available && r.model === r.id));

  const other = toCatalog(models, "ollama:kimi-k2.5", policyFromEnv("workers-ai", false));
  assert.equal(other.default, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(findRoute(other, "ollama:kimi-k2.5"), undefined);
});

test("routes that hide or leak their reasoning stay off the menu", () => {
  const probeFailures: GatewayModel[] = [
    "@cf/moonshotai/kimi-k2.6", "@cf/openai/gpt-oss-120b", "@cf/openai/gpt-oss-20b", "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "@cf/qwen/qwq-32b", "@cf/zai-org/glm-5.3", "@cf/zai-org/glm-5.3-flash",
    "@cf/meta/llama-3.2-11b-vision-instruct",
  ].map((id) => ({ id, provider: "workers-ai", capabilities: ["text-generation", "reasoning"] }));
  const survivors: GatewayModel[] = [
    { id: "@cf/zai-org/glm-5.2", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
    { id: "@cf/deepseek-ai/deepseek-v4-flash-0731", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
  ];
  const kept = selectModels([...probeFailures, ...survivors], policyFromEnv("workers-ai", false)).map((m) => m.id);
  assert.deepEqual(kept, ["@cf/zai-org/glm-5.2", "@cf/deepseek-ai/deepseek-v4-flash-0731"]);
});

test("route labels drop only the @cf/ prefix", () => {
  assert.equal(routeLabel("@cf/google/gemma-4-26b-a4b-it"), "google/gemma-4-26b-a4b-it");
  assert.equal(routeLabel("deepseek/deepseek-chat-v3.1"), "deepseek/deepseek-chat-v3.1");
});

test("CAIL aliases resolve to Workers AI ids and retain saved model selections", () => {
  const full = "@cf/deepseek-ai/deepseek-v4-flash-0731";
  const alias = "deepseek-v4-flash-0731";
  const catalog = toCatalog([
    { id: "gemma-4-26b-a4b-it", provider: "workers-ai" },
    { id: alias, provider: "workers-ai", capabilities: ["text-generation", "reasoning"] },
    { id: "unresolved-new-model", provider: "workers-ai" },
  ], full, policyFromEnv("workers-ai", false));
  assert.equal(catalog.default, alias);
  assert.equal(catalog.models.length, 2);
  assert.equal(findRoute(catalog, alias)?.model, full);
  assert.equal(findRoute(catalog, full)?.id, alias);
  assert.equal(findRoute(catalog, "unresolved-new-model"), undefined);
});

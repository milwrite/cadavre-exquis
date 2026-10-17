import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnBinding } from "../src/inference.ts";
import { toCatalog } from "../src/catalog.ts";
import { policyFromEnv } from "../src/policy.ts";
import { prepareChatBody } from "../src/shape.ts";

test("live catalog aliases reach AI.run with a full upstream id and a deadline", async () => {
  const catalog = toCatalog([{ id: "deepseek-v4-flash-0731", provider: "workers-ai", capabilities: ["text-generation", "reasoning"] }], "@cf/deepseek-ai/deepseek-v4-flash-0731", policyFromEnv("workers-ai", false));
  const { route, request } = prepareChatBody({ messages: [{ role: "user", content: "silver rain" }] }, catalog);
  const ai = { async run(model: string, input: any, options: any) {
    assert.equal(model, "@cf/deepseek-ai/deepseek-v4-flash-0731");
    assert.equal(input.chat_template_kwargs.enable_thinking, false);
    assert.ok(options.signal instanceof AbortSignal);
    return { response: "on borrowed wings" };
  } };
  assert.equal((await runOnBinding(ai as any, route, request)).content, "on borrowed wings");
  await assert.rejects(runOnBinding({ run: async () => ({ response: " " }) } as any, route, request), /no visible text/);
});

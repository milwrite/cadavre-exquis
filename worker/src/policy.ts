/* Which gateway models the game offers.
 *
 * Everything in the CAIL catalog already runs behind Cloudflare AI Gateway. The
 * policy narrows that list to what this Worker can actually run and what makes
 * sense at a poetry table. Shape the menu here: EXCLUDE drops model families
 * that are not conversational writers, and ALLOW (when non-empty) pins an
 * explicit short list for a classroom.
 */

export type GatewayModel = {
  id: string;
  provider?: string;
  status?: string;
  modality?: string;
  capabilities?: string[];
  context_length?: number;
};

export type Policy = {
  /** Provider families the Worker may run. */
  providers: ReadonlySet<string>;
  /** Model ids matching any of these never appear. */
  exclude: readonly RegExp[];
  /** When non-empty, only these ids appear (after exclude). */
  allow: readonly string[];
};

// Safety classifiers, code models, and small LoRA bases with tiny context windows
// write poor folds; they stay off the menu even when the gateway lists them.
// The second group failed a one-fold probe on the AI binding (2026-09-02, 80
// tokens, thinking switched off): they either spent the whole budget on hidden
// reasoning and returned nothing (kimi-k2.6, gpt-oss-*, qwen3-30b) or leaked
// their reasoning into the line (deepseek-r1, qwq, glm-5.3*). The vision model
// is gated behind a one-time license prompt the Worker cannot answer.
export const EXCLUDE: readonly RegExp[] = [
  /llama-guard/i,
  /-coder\b|-code\b/i,
  /-lora$/i,
  /kimi-k2/i,
  /gpt-oss/i,
  /qwen3-30b/i,
  /deepseek-r1/i,
  /qwq-/i,
  /glm-5\.3/i,
  /-vision-/i,
];

export const ALLOW: readonly string[] = [];

export function policyFromEnv(value: string | undefined, gatewayKeyPresent: boolean): Policy {
  const mode = (value || "workers-ai").trim().toLowerCase();
  const providers = new Set<string>(["workers-ai"]);
  // OpenRouter routes only run through the CAIL Gateway, which needs a key.
  if (mode === "all" && gatewayKeyPresent) providers.add("openrouter");
  return { providers, exclude: EXCLUDE, allow: ALLOW };
}

export function selectModels(models: GatewayModel[], policy: Policy): GatewayModel[] {
  const kept: GatewayModel[] = [];
  for (const m of models) {
    const id = String(m.id || "").trim();
    if (!id) continue;
    if ((m.status ?? "active") !== "active") continue;
    if ((m.modality ?? "text") !== "text") continue;
    const capabilities = m.capabilities ?? ["text-generation"];
    if (!capabilities.includes("text-generation")) continue;
    if (!policy.providers.has(m.provider ?? "")) continue;
    if (policy.exclude.some((re) => re.test(id))) continue;
    if (policy.allow.length && !policy.allow.includes(id)) continue;
    kept.push(m);
  }
  return kept;
}

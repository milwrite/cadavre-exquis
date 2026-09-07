/* Both pages load /ui/config.local.js and layer it over their defaults. Serving
 * it from the Worker points them at these same-origin routes, so the pages ship
 * unmodified and the deployment is the whole configuration. */
export function configScript(defaultModel: string, authenticated = false, workerOrigin = false): string {
  const prefix = authenticated && !workerOrigin ? "/cadavre" : "";
  return [
    "// Served by the Cadavre Worker; edit wrangler.jsonc vars, not this file.",
    "window.CORPSE_CONFIG = {",
    `  endpoint: "${prefix}/api/cadavre/chat",`,
    `  readyEndpoint: "${authenticated ? "" : "/api/cadavre/ready"}",`,
    `  modelsEndpoint: "${prefix}/api/cadavre/models",`,
    `  wallEndpoint: "${prefix}/api/cadavre/wall",`,
    `  workEndpoint: "${authenticated ? prefix+"/api/work" : ""}",`,
    `  authenticated: ${authenticated},`,
    `  signInEndpoint: "${workerOrigin ? "/auth/start?next=/" : "https://tools.ailab.gc.cuny.edu/launch/cadavre"}",`,
    `  model: ${JSON.stringify(defaultModel)},`,
    '  apiKey: "",',
    "};",
    "",
  ].join("\n");
}

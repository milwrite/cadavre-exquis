/* Both pages load /ui/config.local.js and layer it over their defaults. Serving
 * it from the Worker points them at these same-origin routes, so the pages ship
 * unmodified and the deployment is the whole configuration. */
export function configScript(defaultModel: string, authenticated = false): string {
  const prefix = authenticated ? "/cadavre" : "";
  return [
    "// Served by the cail-cadavre Worker; edit wrangler.jsonc vars, not this file.",
    "window.CORPSE_CONFIG = {",
    `  endpoint: "${prefix}/api/cadavre/chat",`,
    `  readyEndpoint: "${authenticated ? "" : "/api/cadavre/ready"}",`,
    `  modelsEndpoint: "${prefix}/api/cadavre/models",`,
    `  wallEndpoint: "${prefix}/api/cadavre/wall",`,
    `  workEndpoint: "${authenticated ? "/cadavre/api/work" : ""}",`,
    `  authenticated: ${authenticated},`,
    `  model: ${JSON.stringify(defaultModel)},`,
    '  apiKey: "",',
    "};",
    "",
  ].join("\n");
}

/* Both pages load /ui/config.local.js and layer it over their defaults. Serving
 * it from the Worker points them at these same-origin routes, so the pages ship
 * unmodified and the deployment is the whole configuration. */
export function configScript(defaultModel: string): string {
  return [
    "// Served by the cail-cadavre Worker; edit wrangler.jsonc vars, not this file.",
    "window.CORPSE_CONFIG = {",
    '  endpoint: "/api/cadavre/chat",',
    '  readyEndpoint: "/api/cadavre/ready",',
    '  modelsEndpoint: "/api/cadavre/models",',
    '  wallEndpoint: "/api/cadavre/wall",',
    `  model: ${JSON.stringify(defaultModel)},`,
    '  apiKey: "",',
    "};",
    "",
  ].join("\n");
}

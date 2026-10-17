// Curated against the live CAIL Featured registry, checked 2026-09-11.
// Source: CUNY-AI-Lab/CUNY-AI-Lab-website/src/data/featured-models.json (2026-09-10).
// DeepSeek V4 Flash is the suite default. Gemma is retired from both play modes.
// A registry listing is eligibility; active catalog intersection is still required.
export const GAME_MODELS = [
  { id: 'deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash', group: 'CAIL Featured', provider: 'workers-ai', binding: '@cf/deepseek-ai/deepseek-v4-flash-0731' },
  { id: 'deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro', group: 'CAIL Featured', provider: 'workers-ai', binding: '@cf/deepseek-ai/deepseek-v4-pro-0813' },
  { id: 'qwen3.8-27b', label: 'Qwen3.8 · 27B', group: 'CAIL Featured', provider: 'workers-ai', binding: '@cf/qwen/qwen3.8-27b' },
  { id: 'minimax-m3', label: 'MiniMax M3', group: 'Also at the table', provider: 'openrouter', binding: 'minimax/minimax-m3' },
  { id: 'llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 · 8B', group: 'Compact writers', provider: 'workers-ai', binding: '@cf/meta/llama-3.1-8b-instruct-fp8' },
] as const;

export function gameModel(id: string) {
  return GAME_MODELS.find(model => model.id === id || model.binding === id);
}

// MiniMax still consumes reasoning tokens when reasoning.enabled is false.
// Keep room for visible output after it processes the complete game prompt.
export function generationBudget(id: string, requested: number) {
  return gameModel(id)?.id === 'minimax-m3' ? Math.max(2048, requested) : requested;
}

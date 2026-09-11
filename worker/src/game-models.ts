// Curated against the live CAIL Featured registry, checked 2026-09-11.
// Source: CUNY-AI-Lab/CUNY-AI-Lab-website/src/data/featured-models.json (2026-09-10).
// MiniMax M3 and the two compact writers are explicit additions to Featured.
// A registry listing is eligibility; active catalog intersection is still required.
export const GAME_MODELS = [
  { id: 'gemma-4-26b-a4b-it', label: 'Gemma 4 · 26B, 4B active', group: 'Compact writers', provider: 'workers-ai', binding: '@cf/google/gemma-4-26b-a4b-it' },
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', group: 'CAIL Featured', provider: 'openrouter', binding: 'deepseek/deepseek-v4.1-flash' },
  { id: 'qwen3.8-27b', label: 'Qwen3.8 · 27B', group: 'CAIL Featured', provider: 'workers-ai', binding: '@cf/qwen/qwen3.8-27b' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 · 31B', group: 'CAIL Featured', provider: 'openrouter', binding: 'google/gemma-4-31b-it' },
  { id: 'mistral-small-2603', label: 'Mistral Small 4', group: 'CAIL Featured', provider: 'openrouter', binding: 'mistralai/mistral-small-2603' },
  { id: 'minimax-m3', label: 'MiniMax M3', group: 'Also at the table', provider: 'openrouter', binding: 'minimax/minimax-m3' },
  { id: 'llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 · 8B', group: 'Compact writers', provider: 'workers-ai', binding: '@cf/meta/llama-3.1-8b-instruct-fp8' },
] as const;

export function gameModel(id: string) {
  return GAME_MODELS.find(model => model.id === id || model.binding === id);
}

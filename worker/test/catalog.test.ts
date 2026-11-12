import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCatalog, findRoute, FALLBACK_MODELS } from '../src/catalog.ts';
import { policyFromEnv } from '../src/policy.ts';
import { generationBudget } from '../src/game-models.ts';
const live=JSON.parse(readFileSync(new URL('./fixtures/cail-models-2026-11-12.json',import.meta.url),'utf8'));
const FLASH='deepseek-v4.1-flash-1017';
test('the active registry resolves exactly ten selectable models',()=>{
  const catalog=toCatalog(live,FLASH,policyFromEnv('all',true));
  assert.equal(catalog.models.length,10);
  assert.equal(new Set(catalog.models.map(m=>m.id)).size,10);
  assert.equal(catalog.default,FLASH);
  assert.equal(findRoute(catalog,'kimi-k3')?.provider,'bedrock-runtime');
  assert.equal(findRoute(catalog,'minimax-m2.5')?.provider,'bedrock-mantle');
  assert.equal(findRoute(catalog,'gemma-4-26b-a4b-it')?.provider,'workers-ai');
  assert.equal(findRoute(catalog,'gemma-3-27b-it'),undefined);
});
test('without a gateway key only known featured binding routes are offered',()=>{
  const catalog=toCatalog(live,FLASH,policyFromEnv('all',false));
  assert.equal(catalog.models.length,6);
  assert.ok(catalog.models.every(m=>m.provider==='workers-ai'&&m.model.startsWith('@cf/')));
  assert.equal(findRoute(catalog,'kimi-k3'),undefined);
});
test('unsupported providers, inactive and non-text entries are excluded',()=>{
  const catalog=toCatalog([
    {id:'kimi-k3',provider:'openrouter',capabilities:['text-generation']},
    {id:FLASH,provider:'workers-ai',status:'sunset',capabilities:['text-generation']},
    {id:'audio',provider:'workers-ai',capabilities:['speech-to-text']},
    {id:'unknown-provider',provider:'unknown',capabilities:['text-generation']},
  ],FLASH,policyFromEnv('all',true));
  assert.deepEqual(catalog.models,[]);
});
test('unselected registry models are excluded even when gateway access is configured',()=>{
  const model={id:'new-registered-writer',provider:'workers-ai',capabilities:['text-generation']};
  assert.equal(toCatalog([model],model.id,policyFromEnv('all',true)).models.length,0);
  assert.equal(toCatalog([model],model.id,policyFromEnv('all',false)).models.length,0);
});
test('cold-start fallback preserves the ten featured choices and de-duplicates routes',()=>{
  const catalog=toCatalog([...FALLBACK_MODELS,...FALLBACK_MODELS],FLASH,policyFromEnv('all',true));
  assert.equal(catalog.models.length,10);
  assert.equal(findRoute(catalog,'@cf/google/gemma-4-26b-a4b-it')?.id,'gemma-4-26b-a4b-it');
  assert.equal(findRoute(catalog,'minimax-m3')?.id,'minimax-m2.5');
});
test('AWS short tasks reserve reasoning space without increasing compact tasks',()=>{
  for(const id of ['minimax-m2.5','kimi-k2.5','kimi-k3','nemotron-super-3-120b'])assert.equal(generationBudget(id,80),2048);
  assert.equal(generationBudget(FLASH,80),80);
});

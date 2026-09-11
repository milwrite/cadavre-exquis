import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCatalog, findRoute, FALLBACK_MODELS } from '../src/catalog.ts';
import { policyFromEnv, type GatewayModel } from '../src/policy.ts';
import { GAME_MODELS } from '../src/game-models.ts';
const models:GatewayModel[] = [
  ...GAME_MODELS.map(m=>({id:m.id,provider:m.provider,capabilities:['text-generation','reasoning']})),
  {id:'deepseek-v4-flash-0731',provider:'workers-ai',capabilities:['text-generation']},
  {id:'kimi-k3',provider:'openrouter',capabilities:['text-generation']},
  {id:'whisper-large-v3-turbo',provider:'workers-ai',capabilities:['speech-to-text']},
];
test('public play offers only curated runnable binding models',()=>{
  const catalog=toCatalog(models,'gemma-4-26b-a4b-it',policyFromEnv('workers-ai',false));
  assert.deepEqual(catalog.models.map(m=>m.id),['gemma-4-26b-a4b-it','qwen3.8-27b','llama-3.1-8b-instruct-fp8']);
  assert.equal(catalog.default,'gemma-4-26b-a4b-it');
  assert.equal(findRoute(catalog,'@cf/google/gemma-4-26b-a4b-it')?.id,'gemma-4-26b-a4b-it');
  assert.equal(findRoute(catalog,'deepseek-v4-flash-0731'),undefined);
  assert.equal(findRoute(catalog,'minimax-m3'),undefined);
});
test('an app-key policy adds curated OpenRouter choices without exposing the full catalog',()=>{
  const catalog=toCatalog(models,'minimax-m3',policyFromEnv('all',true));
  assert.equal(catalog.models.length,7);
  assert.equal(catalog.default,'minimax-m3');
  assert.equal(findRoute(catalog,'kimi-k3'),undefined);
  assert.equal(findRoute(catalog,'minimax-m3')?.provider,'openrouter');
  assert.equal(toCatalog(models,'',policyFromEnv('all',false)).models.length,3);
});
test('inactive, wrong-provider, non-text, and unknown models never become routes',()=>{
  const catalog=toCatalog([
    {id:'gemma-4-26b-a4b-it',provider:'workers-ai',status:'sunset'},
    {id:'qwen3.8-27b',provider:'openrouter',capabilities:['text-generation']},
    {id:'minimax-m3',provider:'openrouter',capabilities:['vision']},
    {id:'unresolved-new-model',provider:'workers-ai',capabilities:['text-generation']},
  ],'',policyFromEnv('all',true));
  assert.deepEqual(catalog.models,[]);
  assert.equal(catalog.default,'');
});
test('an outage fallback remains inside the shortlist and preserves supported full ids',()=>{
  const full='@cf/google/gemma-4-26b-a4b-it';
  const catalog=toCatalog([...FALLBACK_MODELS,...FALLBACK_MODELS],full,policyFromEnv('workers-ai',false));
  assert.equal(catalog.models.length,3);
  assert.equal(catalog.default,'gemma-4-26b-a4b-it');
  assert.equal(findRoute(catalog,full)?.model,full);
  assert.equal(findRoute(catalog,full)?.label,'Gemma 4 · 26B, 4B active');
});

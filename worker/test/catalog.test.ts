import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCatalog, findRoute, FALLBACK_MODELS } from '../src/catalog.ts';
import { policyFromEnv, type GatewayModel } from '../src/policy.ts';
import { GAME_MODELS, generationBudget } from '../src/game-models.ts';
const models:GatewayModel[] = [
  ...GAME_MODELS.map(m=>({id:m.id,provider:m.provider,capabilities:['text-generation','reasoning']})),
  {id:'deepseek-v4-flash-0731',provider:'workers-ai',capabilities:['text-generation']},
  {id:'kimi-k3',provider:'openrouter',capabilities:['text-generation']},
  {id:'whisper-large-v3-turbo',provider:'workers-ai',capabilities:['speech-to-text']},
];
test('MiniMax reserves reasoning room without changing compact-model budgets',()=>{
  assert.equal(generationBudget('minimax-m3',80),2048);
  assert.equal(generationBudget('minimax/minimax-m3',400),2048);
  assert.equal(generationBudget('deepseek-v4-flash-0731',80),80);
});
test('public play offers only curated runnable binding models',()=>{
  const catalog=toCatalog(models,'deepseek-v4-flash-0731',policyFromEnv('workers-ai',false));
  assert.deepEqual(catalog.models.map(m=>m.id),['deepseek-v4-flash-0731','deepseek-v4-pro-0813','qwen3.8-27b','llama-3.1-8b-instruct-fp8']);
  assert.equal(catalog.default,'deepseek-v4-flash-0731');
  assert.equal(findRoute(catalog,'@cf/deepseek-ai/deepseek-v4-flash-0731')?.id,'deepseek-v4-flash-0731');
  assert.equal(findRoute(catalog,'gemma-4-26b-a4b-it'),undefined);
  assert.equal(findRoute(catalog,'minimax-m3'),undefined);
});
test('an app-key policy adds curated OpenRouter choices without exposing the full catalog',()=>{
  const catalog=toCatalog(models,'minimax-m3',policyFromEnv('all',true));
  assert.equal(catalog.models.length,5);
  assert.equal(catalog.default,'minimax-m3');
  assert.equal(findRoute(catalog,'kimi-k3'),undefined);
  assert.equal(findRoute(catalog,'minimax-m3')?.provider,'openrouter');
  assert.equal(toCatalog(models,'',policyFromEnv('all',false)).models.length,4);
});
test('inactive, wrong-provider, non-text, and unknown models never become routes',()=>{
  const catalog=toCatalog([
    {id:'deepseek-v4-flash-0731',provider:'workers-ai',status:'sunset'},
    {id:'qwen3.8-27b',provider:'openrouter',capabilities:['text-generation']},
    {id:'minimax-m3',provider:'openrouter',capabilities:['vision']},
    {id:'unresolved-new-model',provider:'workers-ai',capabilities:['text-generation']},
  ],'',policyFromEnv('all',true));
  assert.deepEqual(catalog.models,[]);
  assert.equal(catalog.default,'');
});
test('an outage fallback remains inside the shortlist and preserves supported full ids',()=>{
  const full='@cf/deepseek-ai/deepseek-v4-flash-0731';
  const catalog=toCatalog([...FALLBACK_MODELS,...FALLBACK_MODELS],full,policyFromEnv('workers-ai',false));
  assert.equal(catalog.models.length,4);
  assert.equal(catalog.default,'deepseek-v4-flash-0731');
  assert.equal(findRoute(catalog,full)?.model,full);
  assert.equal(findRoute(catalog,full)?.label,'DeepSeek V4 Flash');
});

test('Gemma cannot re-enter either catalog, and retired defaults resolve to Flash',()=>{
  const retired=['gemma-4-26b-a4b-it','gemma-4-31b-it','@cf/google/gemma-4-26b-a4b-it'];
  for(const mode of ['workers-ai','all'])for(const old of retired){
    const catalog=toCatalog([...models,...retired.map(id=>({id,provider:'workers-ai',capabilities:['text-generation']}))],old,policyFromEnv(mode,true));
    assert.equal(catalog.default,'deepseek-v4-flash-0731');
    assert.ok(catalog.models.every(m=>!m.id.includes('gemma')&&!m.model.includes('gemma')));
    assert.equal(findRoute(catalog,old),undefined);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCatalog } from '../src/catalog.ts';
import { policyFromEnv } from '../src/policy.ts';
import { UpstreamError } from '../src/inference.ts';
import { FAILED_TTL_MS, ensureReady, requestForRoute, RouteHealth, withFallback } from '../src/routes.ts';
import { signedCompletion, GatewayFailure } from '../src/signed-inference.ts';
import type { ChatRequest } from '../src/shape.ts';

const GEMMA = 'gemma-4-26b-a4b-it';
const QWEN = 'qwen3.8-27b';
const LLAMA = 'llama-3.1-8b-instruct-fp8';
const MINIMAX = 'minimax-m3';
const listed = [GEMMA, QWEN, LLAMA, MINIMAX].map(id => ({ id, provider: id === MINIMAX ? 'openrouter' : 'workers-ai', capabilities: ['text-generation', 'reasoning'] }));
const catalog = toCatalog(listed, GEMMA, policyFromEnv('workers-ai', false));
const all = toCatalog(listed, GEMMA, policyFromEnv('all', true));
const body: ChatRequest = { model: GEMMA, messages: [{ role: 'user', content: 'the river' }], max_tokens: 80, temperature: 0.8 };

test('a failed turn retries once inside the curated public catalog and names the answering model', async () => {
  const health = new RouteHealth();
  const calls: string[] = [];
  const result = await withFallback(health, catalog, GEMMA, async route => {
    calls.push(route.id);
    if (route.id === GEMMA) throw new UpstreamError('Workers AI: 5007', 502);
    return { content: 'silver rain' };
  });
  assert.deepEqual(calls, [GEMMA, QWEN]);
  assert.equal(result.route.id, QWEN);
  assert.equal(result.failover, true);
  assert.equal(result.result.content, 'silver rain');
  assert.equal(health.annotate(catalog).default, QWEN);
  assert.equal(health.annotate(catalog).models.find(r => r.id === GEMMA)?.available, false);
  assert.ok(calls.every(id => id !== MINIMAX));
});

test('public failures are remembered briefly, then the requested model can recover', async () => {
  let time = 0;
  const health = new RouteHealth(() => time);
  health.markFailed(GEMMA);
  assert.equal(health.candidates(catalog, GEMMA)[0].id, QWEN);
  time += FAILED_TTL_MS + 1;
  assert.equal(health.candidates(catalog, GEMMA)[0].id, GEMMA);
});

for (const status of [400,401,402,403,413,429]) test(`HTTP ${status} is preserved without fallback or a shared failed-model mark`, async () => {
  const health = new RouteHealth();
  let calls = 0;
  await assert.rejects(withFallback(health, catalog, GEMMA, async () => { calls++; throw new UpstreamError('stop', status); }), error => error instanceof UpstreamError && error.status === status);
  assert.equal(calls, 1);
  assert.equal(health.isFailed(GEMMA), false);
});

test('a hung provider receives an abort signal before another model takes the turn', async () => {
  let aborted = false;
  const result = await withFallback(new RouteHealth(), catalog, GEMMA, async (route, signal) => {
    if (route.id !== GEMMA) return 'recovered';
    return new Promise<string>((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true }));
  }, { timeoutMs: 15, totalMs: 100 });
  assert.equal(aborted, true);
  assert.equal(result.result, 'recovered');
});

test('a cancelled browser request cannot launch a standby call', async () => {
  const controller = new AbortController();
  const health = new RouteHealth();
  let calls = 0;
  await assert.rejects(withFallback(health, catalog, GEMMA, async () => { calls++; controller.abort(new Error('cancelled')); throw new UpstreamError('provider aborted', 502); }, { signal: controller.signal }), /cancelled/);
  assert.equal(calls, 1);
  assert.equal(health.isFailed(GEMMA), false);
});

test('exhaustion stops after two turn attempts and unknown model names never trigger inference', async () => {
  let calls = 0;
  const run = async () => { calls++; throw new UpstreamError('offline', 502); };
  await assert.rejects(withFallback(new RouteHealth(), catalog, GEMMA, run), /offline/);
  assert.equal(calls, 2);
  await assert.rejects(withFallback(new RouteHealth(), catalog, 'not-listed', run), /catalog/);
  assert.equal(calls, 2);
});

test('readiness requires visible text, reuses successful probes, and respects MiniMax budget', async () => {
  const health = new RouteHealth();
  const calls: string[] = [];
  const run = async (route: typeof catalog.models[number], request: ChatRequest) => {
    calls.push(route.id);
    if (route.id === MINIMAX) assert.equal(request.max_tokens, 2048);
    return { content: route.id === GEMMA ? '  ' : 'ready' };
  };
  const first = await ensureReady(health, catalog, GEMMA, run);
  assert.equal(first.route.id, QWEN);
  assert.equal((await ensureReady(health, catalog, GEMMA, run)).result.cached, true);
  assert.deepEqual(calls, [GEMMA, QWEN]);
  await ensureReady(new RouteHealth(), all, MINIMAX, run);
});

test('switching model families rebuilds reasoning controls and token budgets', () => {
  const mini = all.models.find(r => r.id === MINIMAX)!;
  const request = requestForRoute({ ...body, chat_template_kwargs: { enable_thinking: true } }, mini);
  assert.equal(request.max_tokens, 2048);
  assert.equal(request.chat_template_kwargs, undefined);
  assert.deepEqual(request.reasoning, { enabled: false });
  const standby = requestForRoute(body, catalog.models[0]);
  assert.equal(standby.max_tokens, 80);
  assert.deepEqual(standby.messages, body.messages);
});

test('signed fallback keeps the same identity token, prompt and served attribution', async () => {
  const calls: { body: ChatRequest; authorization: string }[] = [];
  const gateway = { async fetch(_input: unknown, init?: RequestInit) {
    const request = JSON.parse(init!.body as string);
    calls.push({ body: request, authorization: new Headers(init!.headers).get('authorization')! });
    assert.ok(init!.signal instanceof AbortSignal);
    if (calls.length === 1) return Response.json({ error: 'upstream unavailable' }, { status: 502 });
    return Response.json({ model: '@cf/qwen/qwen3.8-27b', choices: [{ message: { content: 'turns silver' } }] });
  } };
  const result = await signedCompletion(gateway, 'fixture-token', all, all.models[0], body, new AbortController().signal);
  assert.equal(result.result.model, QWEN);
  assert.equal(result.failover, true);
  assert.ok(calls.every(call => call.authorization === 'Bearer fixture-token'));
  assert.deepEqual(calls.map(call => call.body.messages), [body.messages, body.messages]);
});

test('signed gateway admission responses remain intact and are not retried', async () => {
  let calls = 0;
  const response = Response.json({ error: { code: 'admission_required' } }, { status: 403 });
  const gateway = { async fetch() { calls++; return response; } };
  await assert.rejects(signedCompletion(gateway, 'fixture-token', all, all.models[0], body, new AbortController().signal), error => error instanceof GatewayFailure && error.response === response);
  assert.equal(calls, 1);
});

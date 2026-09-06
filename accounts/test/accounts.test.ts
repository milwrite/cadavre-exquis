import {cadavreManifest,fixtureManifest} from './worker-manifest.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const origin='https://tools.ailab.gc.cuny.edu';
const subject=(letter:string)=>'cail-'+letter.repeat(32);
let mf:Miniflare;
let jwts:Record<string,string>={};
let usedModels:string[]=[];
let providerFails=false;
async function call(path:string,method='GET',body?:unknown,who='a',app='hub',overrideHeaders:Record<string,string>={}) {
  const route=app==='hub'?'/my-work/api'+path:'/api/work'+path;
  return mf.dispatchFetch(origin+route,{method,headers:{origin,'content-type':'application/json','x-test-app':app,'x-cail-identity-jwt':jwts[who+':'+app], 'x-cail-gateway-identity-jwt':jwts[who+':gateway'],...overrideHeaders},body:body===undefined?undefined:JSON.stringify(body)});
}
const entry=(app='cadavre', title='Paper lantern')=>({id:crypto.randomUUID(),app,kind:app==='cadavre'?'poem':app==='jeopardy'?'board':'exercise',title,expectedRevision:0,content:{schemaVersion:1,contributions:[{role:'user',content:'Paper lantern crosses the river.'},{role:'assistant',content:'Its light finds another shore.',model:'test/poetry'}],text:'Paper lantern crosses the river.\nIts light finds another shore.',reading:'A change in perspective.',settings:{temperature:.8},record:{}}});
before(async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
  const jwk=await exportJWK(publicKey);jwk.kid='local-test';jwk.alg='RS256';jwk.use='sig';
  for(const who of ['a','b','c','d','e','f'])for(const app of ['hub','cadavre','jeopardy','cloze','gateway'])jwts[who+':'+app]=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'local-test'}).setSubject(subject(who)).setIssuer(origin+'/cail-sso').setAudience('cail:'+(app==='hub'?'work-accounts':app)).setIssuedAt().setExpirationTime('10m').sign(privateKey);
  mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'caller',modules:true,compatibilityDate:'2026-09-06',script:`export default {async fetch(r,e){const app=r.headers.get('x-test-app');const path=new URL(r.url).pathname;if(path==='/register')return Response.json(await (app==='cadavre'?e.CADAVRE:app==='jeopardy'?e.JEOPARDY:e.CLOZE).register());if(path==='/begin')return Response.json(await e.CADAVRE.beginModel(r.headers.get('x-cail-identity-jwt')));if(path==='/late')return Response.json(await e.CADAVRE.modelCompleted(r.headers.get('x-cail-identity-jwt'),'test/late',null,Number(r.headers.get('x-generation')))); if(new URL(r.url).pathname==='/model'){const jwt=r.headers.get('x-cail-identity-jwt');const {generation}=await e.CADAVRE.beginModel(jwt);return Response.json(await e.CADAVRE.modelCompleted(jwt,'test/most-recent',null,generation));} return (app==='cadavre'?e.CADAVRE:app==='jeopardy'?e.JEOPARDY:app==='cloze'?e.CLOZE:e.HUB).fetch(r);}}`,serviceBindings:{HUB:'accounts',CADAVRE:{name:'accounts',entrypoint:'WorkerAccounts',props:cadavreManifest},JEOPARDY:{name:'accounts',entrypoint:'WorkerAccounts',props:fixtureManifest('jeopardy','board')},CLOZE:{name:'accounts',entrypoint:'WorkerAccounts',props:fixtureManifest('cloze','exercise')}}},
    {name:'accounts',modules:true,compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat','enable_request_signal'],scriptPath:'dist/index.js',bindings:{CAIL_IDENTITY_JWKS:JSON.stringify({keys:[jwk]}),RELEASE:'local-test'},d1Databases:['DB'],durableObjects:{ACCOUNTS:{className:'AccountCoordinator',useSQLite:true}},serviceBindings:{ADMISSION_RESOLVER:{name:'admission',entrypoint:'AdmissionResolver'},GATEWAY:async(request:Request)=>{const body=await request.json() as {model:string};usedModels.push(body.model);return Response.json(providerFails?{error:{message:'test failure'}}:{model:body.model,choices:[{message:{content:'The user returns to images of light and movement. Try varying the verb in the next poem.'}}]},{status:providerFails?503:200});}}},
    {name:'admission',modules:true,compatibilityDate:'2026-09-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class AdmissionResolver extends WorkerEntrypoint{resolveMembership({subject}){if(subject==='${subject('d')}')return {ok:false};if(subject==='${subject('e')}')return {ok:false,code:'not_admitted',retryable:false};if(subject==='${subject('f')}')return {ok:true,expiresAt:'2099-02-31T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};return {ok:true,expiresAt:subject==='${subject('c')}'?'2020-01-01T00:00:00.000Z':'2099-01-01T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};}}export default {fetch(){return new Response('local Admission double');}}`},
  ]}));
  const db=await mf.getD1Database('DB','accounts');
  const schema=(await Promise.all(['0001_accounts.sql','0002_application_catalog.sql','0003_registered_workers.sql'].map(file=>readFile('migrations/'+file,'utf8')))).join('\n');
  for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  for(const app of ['cadavre','jeopardy','cloze'])assert.equal((await mf.dispatchFetch(origin+'/register',{headers:{'x-test-app':app}})).status,200);
});
after(async()=>{await mf?.dispose();});
test('actual Worker verifier rejects absent/wrong audience identity, expired membership and cross-origin writes',async()=>{
  assert.equal((await call('/profile','GET',undefined,'a','hub',{'x-cail-identity-jwt':''})).status,401);
  assert.equal((await call('/profile','GET',undefined,'a','hub',{'x-cail-identity-jwt':jwts['a:cadavre']})).status,401);
  assert.equal((await call('/profile','GET',undefined,'c')).status,403);
  assert.equal((await call('/profile','PATCH',{},'a','hub',{origin:'https://foreign.example'})).status,403);
  assert.equal((await call('/profile')).status,200);
  assert.equal((await call('/profile','GET',undefined,'d')).status,503);
  assert.equal((await call('/profile','GET',undefined,'e')).status,403);
  assert.equal((await call('/profile','GET',undefined,'f')).status,503);
});
test('real D1/DO save, ownership isolation, simultaneous revision conflict and scoped app entrypoints',async()=>{
  const value=entry();assert.equal((await call('/entries','PUT',value,'a','cadavre')).status,201);
  assert.equal((await call('/entries/'+value.id,'GET',undefined,'b')).status,404);
  assert.equal((await call('/entries/'+value.id,'GET',undefined,'a','cloze')).status,404);
  assert.equal((await call('/entries','PUT',entry('cloze'),'a','cadavre')).status,400);
  const edits=await Promise.all(['first','second'].map(title=>call('/entries','PUT',{...value,title,expectedRevision:1},'a','cadavre')));
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  const saved=await (await call('/entries/'+value.id)).json() as {item:{revision:number}};assert.equal(saved.item.revision,2);
  for(const app of ['jeopardy','cloze'])assert.equal((await call('/entries','PUT',entry(app),'a',app)).status,201);
});
test('five recent unpinned items with independently pinned work and lossless archive',async()=>{
  const values=Array.from({length:7},(_,i)=>entry('cadavre','Saved '+i));
  for(const value of values)assert.equal((await call('/entries','PUT',value)).status,201);
  assert.equal((await call('/entries/'+values[0].id+'/pin','PATCH',{pinned:true,expectedRevision:1})).status,200);
  const dashboard=await (await call('/dashboard')).json() as {apps:{cadavre:{recent:unknown[];pinned:unknown[];total:number}}};
  assert.equal(dashboard.apps.cadavre.recent.length,5);assert.equal(dashboard.apps.cadavre.pinned.length,1);assert.equal(dashboard.apps.cadavre.total,8);
  const archive=await (await call('/entries?app=cadavre')).json() as {items:unknown[]};assert.equal(archive.items.length,8);
});
test('settings are persisted with optimistic concurrency and credentials are rejected from metadata',async()=>{
  const change={displayName:'Local acceptance',defaultApp:'cloze',expectedRevision:1};
  assert.equal((await call('/profile','PATCH',change)).status,200);assert.equal((await call('/profile','PATCH',change)).status,409);
  const p=await (await call('/profile')).json() as {profile:{displayName:string;defaultApp:string}};assert.equal(p.profile.defaultApp,'cloze');assert.equal(p.profile.displayName,change.displayName);
  const bad=entry();bad.content.record={apiKey:'never-save'};assert.equal((await call('/entries','PUT',bad)).status,400);
});
test('removed reflection endpoint cannot invoke a model and catalog is scoped',async()=>{
  assert.equal((await call('/reflection','POST',{})).status,404);
  assert.deepEqual(usedModels,[]);
  const catalog=await (await call('/applications','GET',undefined,'a','cadavre')).json() as {applications:{id:string}[];labLinks:unknown[]};
  assert.deepEqual(catalog.applications.map(app=>app.id),['cadavre']);assert.deepEqual(catalog.labLinks,[]);
});
test('deletion cascades owned records and export never contains identity subjects',async()=>{
  const exported=await (await call('/export')).json();assert.ok(!JSON.stringify(exported).includes(subject('a')));
  assert.equal((await call('/account-data','DELETE',{confirmation:'DELETE MY WORK'})).status,200);
  const db=await mf.getD1Database('DB','accounts');for(const table of ['entries','model_runs','reflections','entry_events']){const row=await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE subject=?').bind(subject('a')).first<{n:number}>();assert.equal(row?.n,0);}
});

test('late model completions cannot recreate deleted account data',async()=>{
  const headers={'x-cail-identity-jwt':jwts['b:cadavre']};
  const {generation}=await (await mf.dispatchFetch(origin+'/begin',{headers})).json() as {generation:number};
  assert.equal((await call('/account-data','DELETE',{confirmation:'DELETE MY WORK'},'b')).status,200);
  const late=await (await mf.dispatchFetch(origin+'/late',{headers:{...headers,'x-generation':String(generation)}})).json() as {recorded:boolean};
  assert.equal(late.recorded,false);
  const db=await mf.getD1Database('DB','accounts');
  const count=await db.prepare('SELECT COUNT(*) AS n FROM model_runs WHERE subject=?').bind(subject('b')).first<{n:number}>();assert.equal(count?.n,0);
});
test('named app exports remain scoped',async()=>{
  for(const app of ['cadavre','cloze'])assert.equal((await call('/entries','PUT',entry(app),'b',app)).status,201);
  const exported=await (await call('/export','GET',undefined,'b','cadavre')).json() as {entries:{app:string}[]};assert.deepEqual(exported.entries.map(e=>e.app),['cadavre']);
  assert.equal((await call('/reflection','POST',{},'b','cadavre')).status,404);
});

test('all-application library search preserves subject and adapter scope',async()=>{
  const needle='Cross-tool needle';
  for(const app of ['cadavre','cloze'])assert.equal((await call('/entries','PUT',entry(app,needle),'b',app)).status,201);
  assert.equal((await call('/entries','PUT',entry('cadavre',needle),'a')).status,201);
  const all=await (await call('/entries?app=all&q=needle','GET',undefined,'b')).json() as {items:{app:string}[]};
  assert.deepEqual(all.items.map(e=>e.app).sort(),['cadavre','cloze']);
  const scoped=await (await call('/entries?app=all&q=needle','GET',undefined,'b','cloze')).json() as {items:{app:string}[]};
  assert.deepEqual(scoped.items.map(e=>e.app),['cloze']);
  const p=await (await call('/profile','GET',undefined,'b')).json() as {profile:{revision:number}};
  assert.equal((await call('/profile','PATCH',{displayName:'All apps',defaultApp:'all',expectedRevision:p.profile.revision},'b')).status,200);
  const saved=await (await call('/profile','GET',undefined,'b')).json() as {profile:{defaultApp:string}};assert.equal(saved.profile.defaultApp,'all');
  const invalid={...entry(),app:'unregistered'};assert.equal((await call('/entries','PUT',invalid)).status,400);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {fixtureManifest} from './worker-manifest.ts';
test('new Worker registers through real binding props without changing the hub, preserves scope and rejects conflicting routes',async()=>{
  const origin='https://tools.ailab.gc.cuny.edu', subject='cail-'+'a'.repeat(32);
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'registry',alg:'RS256',use:'sig'});
  const tokens:Record<string,string>={};
  for(const audience of ['work-accounts','drawing','other'])tokens[audience]=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'registry'}).setSubject(subject).setIssuer(origin+'/cail-sso').setAudience('cail:'+audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const drawing=fixtureManifest('drawing','artifact');
  const manifests={DRAW:drawing,NEW:{...drawing,version:2,resumePath:'/drawing/edit/'},CONFLICT:{...drawing,kind:'poem'},SAMEVERSION:{...drawing,name:'Wrong name'},BAD:{...drawing,resumePath:'//evil.example/'},ESCAPE:{...drawing,resumePath:'/drawing/%2e%2e/admin'},RESERVED:{...drawing,id:'all'},MISSING:{},OTHER:fixtureManifest('other','artifact')};
  const serviceBindings=Object.fromEntries(Object.entries(manifests).map(([name,props])=>[name,{name:'accounts',entrypoint:'WorkerAccounts',props}]));
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'caller',modules:true,compatibilityDate:'2026-09-06',script:`export default{async fetch(r,e){const b=e[r.headers.get('x-test-binding')||'HUB'];try{if(new URL(r.url).pathname==='/register')return Response.json(await b.register());return await b.fetch(r);}catch{return new Response('Registration rejected',{status:503});}}}`,serviceBindings:{...serviceBindings,HUB:'accounts'}},
    {name:'accounts',modules:true,compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat','enable_request_signal'],scriptPath:'dist/index.js',bindings:{CAIL_IDENTITY_JWKS:JSON.stringify({keys:[jwk]})},d1Databases:['DB'],durableObjects:{ACCOUNTS:{className:'AccountCoordinator',useSQLite:true}},serviceBindings:{ADMISSION_RESOLVER:{name:'admission',entrypoint:'AdmissionResolver'}}},
    {name:'admission',modules:true,compatibilityDate:'2026-09-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class AdmissionResolver extends WorkerEntrypoint{resolveMembership(){return {ok:true,expiresAt:'2099-01-01T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};}}export default{fetch(){return new Response();}}`}
  ]}));
  try{
    const db=await mf.getD1Database('DB','accounts');
    for(const file of ['0001_accounts.sql','0002_application_catalog.sql','0003_registered_workers.sql'])for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
    const call=(path:string,binding='HUB',audience='work-accounts',body?:unknown)=>mf.dispatchFetch(origin+path,{method:body===undefined?'GET':'PUT',headers:{origin,'content-type':'application/json','x-test-binding':binding,'x-cail-identity-jwt':tokens[audience]},body:body===undefined?undefined:JSON.stringify(body)});
    const catalog=async()=>((await (await call('/my-work/api/applications')).json()) as {applications:any[]}).applications;
    assert.deepEqual(await catalog(),[]);
    for(const binding of ['BAD','ESCAPE','RESERVED','MISSING'])assert.equal((await call('/register',binding)).status,503);
    assert.equal((await call('/register','DRAW')).status,200);
    assert.deepEqual((await catalog()).map(a=>[a.id,a.workerOrigin,a.resumePath]),[['drawing','https://cail-drawing.ailab-452.workers.dev','/drawing/play/']]);
    assert.equal((await call('/api/work/profile','DRAW','other')).status,401);
    const item={id:crypto.randomUUID(),app:'drawing',kind:'artifact',title:'New Worker artifact',expectedRevision:0,content:{schemaVersion:1,contributions:[],text:'A sketch',reading:'',settings:{},record:{shapes:[{x:1,y:2}]}}};
    assert.equal((await call('/api/work/entries','DRAW','drawing',item)).status,201);
    assert.equal((await call('/api/work/entries/'+item.id,'OTHER','other')).status,404);
    assert.equal((await call('/api/work/entries','DRAW','drawing',{...item,id:crypto.randomUUID(),app:'other'})).status,400);
    assert.equal((await call('/my-work/api/applications','HUB','work-accounts',{id:'forged'})).status,404);
    for(const binding of ['CONFLICT','SAMEVERSION'])assert.equal((await call('/register',binding)).status,503);
    assert.equal((await call('/register','NEW')).status,200);
    assert.equal((await call('/register','DRAW')).status,200);
    assert.equal((await catalog()).find(a=>a.id==='drawing').resumePath,'/drawing/edit/');
    await db.prepare('DELETE FROM registered_workers WHERE id=?').bind('drawing').run();
    const dashboard:any=await (await call('/my-work/api/dashboard')).json();assert.equal(dashboard.apps.drawing.recent[0].id,item.id);
    assert.equal((await call('/my-work/api/entries/'+item.id)).status,200);
    const exported:any=await (await call('/my-work/api/export')).json();assert.equal(exported.entries[0].id,item.id);
    assert.equal((await call('/my-work/api/entries','HUB','work-accounts',{...item,expectedRevision:1,title:'Still editable'})).status,200);
  }finally{await mf.dispose();}
});

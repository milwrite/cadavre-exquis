// Actual Cadavre Worker, private account RPC and D1/DO. CUNY signing,
// Admission and model are local doubles; Doorway handoff functions are real.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK} from 'jose';
const source=process.env.DOORWAY_SOURCE;if(!source)throw new Error('Set DOORWAY_SOURCE');
const temporary=await mkdtemp(join(tmpdir(),'cail-worker-origin-'));
await build({stdin:{contents:`export * from './src/worker-sessions.ts';export {parsePolicy} from './src/policy.ts';export {ADMISSION_CONTRACT} from './src/admission-contract.ts';export {issueSessionCookie} from './src/session.ts';`,resolveDir:resolve(source)},bundle:true,platform:'node',format:'esm',outfile:join(temporary,'doorway.mjs')});
const d=await import(pathToFileURL(join(temporary,'doorway.mjs')).href);
const origin='https://cadavre.ailab-452.workers.dev', campus='https://tools.ailab.gc.cuny.edu';
const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'origin-test',alg:'RS256',use:'sig'});const jwksJson=JSON.stringify({keys:[jwk]});
let modelCalls=0,redeems=0;const membership={ok:true,expiresAt:'2099-01-01T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};
const config={admissionContract:d.ADMISSION_CONTRACT,canonicalOrigin:campus,policy:d.parsePolicy(JSON.parse(await readFile(join(source,'config/route-policy.json'),'utf8'))),identity:{signingKey:privateKey,signingKid:'origin-test',jwksJson,ownershipSalt:'local-only',operationalSalt:'local-only'},session:{secret:crypto.getRandomValues(new Uint8Array(32)),idleSeconds:86400,absoluteSeconds:604800},admissionResolver:{resolveMembership:async()=>membership}};
const records=new Map();const store={put:async(id,value,expires)=>{records.set(id,{value,expires});},peek:async id=>{const r=records.get(id);return r&&r.expires>Date.now()?r.value:null;},consume:async id=>{const r=records.get(id);records.delete(id);return r&&r.expires>Date.now()?r.value:null;}};
const props={id:'cadavre',worker:'cadavre',workspace:true};
const identityBridge=async request=>{const {action,args}=await request.json();try{let result;if(action==='begin')result=await d.beginWorkerLogin(config,store,props,...args);else if(action==='redeem'){redeems++;result=await d.redeemWorkerLogin(config,store,props,...args);}else if(action==='identities')result=await d.workerIdentities(config,store,props,...args);else result=await d.revokeWorkerSession(store,props,...args);return Response.json(result);}catch{return Response.json({ok:false,status:401});}};
const manifest={id:'cadavre',worker:'cadavre',version:2,name:'Cadavre',description:'Write a poem, one contribution at a time.',kind:'poem',workerRoutes:true,href:'/',resumePath:'/play/'};
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
{name:'cadavre',modules:true,compatibilityDate:'2026-09-06',scriptPath:resolve('../worker/dist-worker/index.js'),modulesRoot:resolve('..'),bindings:{PUBLIC_ORIGIN:origin,CAIL_IDENTITY_JWKS:jwksJson,CADAVRE_DEFAULT_MODEL:'test/poetry',RELEASE:'origin-test'},ratelimits:{TURN_LIMIT:{namespace_id:'74101',simple:{limit:100,period:60}}},durableObjects:{STORE:{className:'CadavreStore',useSQLite:true}},assets:{directory:resolve('../worker/dist'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},serviceBindings:{IDENTITY:{name:'identity',entrypoint:'WorkerIdentity'},WORKSPACE:'accounts',WORK_ACCOUNTS:{name:'accounts',entrypoint:'WorkerAccounts',props:manifest},ADMISSION_RESOLVER:{name:'admission',entrypoint:'AdmissionResolver'},GATEWAY:async request=>{modelCalls++;const body=await request.json();return Response.json({model:body.model,choices:[{message:{content:'A lantern drifts.'}}]});}}},
{name:'identity',modules:true,compatibilityDate:'2026-09-06',script:`import{WorkerEntrypoint}from'cloudflare:workers';export class WorkerIdentity extends WorkerEntrypoint{async run(action,args){return(await this.env.BRIDGE.fetch(new Request('https://test/',{method:'POST',body:JSON.stringify({action,args})}))).json();}begin(...a){return this.run('begin',a)}redeem(...a){return this.run('redeem',a)}identities(...a){return this.run('identities',a)}revoke(...a){return this.run('revoke',a)}}export default{fetch(){return new Response(null,{status:404})}}`,serviceBindings:{BRIDGE:identityBridge}},
{name:'accounts',modules:true,compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat','enable_request_signal'],scriptPath:'dist/index.js',bindings:{CAIL_IDENTITY_JWKS:jwksJson,RELEASE:'origin-test'},d1Databases:['DB'],durableObjects:{ACCOUNTS:{className:'AccountCoordinator',useSQLite:true}},serviceBindings:{ADMISSION_RESOLVER:{name:'admission',entrypoint:'AdmissionResolver'}}},
{name:'admission',modules:true,compatibilityDate:'2026-09-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class AdmissionResolver extends WorkerEntrypoint{resolveMembership(){return ${JSON.stringify(membership)};}}export default{fetch(){return new Response();}}`}
]}));
try{
 const db=await mf.getD1Database('DB','accounts');for(const file of ['0001_accounts.sql','0002_application_catalog.sql','0003_registered_workers.sql'])for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const call=(path,{cookie='',method='GET',body,requestOrigin=origin,extra={}}={})=>mf.dispatchFetch(origin+path,{method,headers:{cookie,origin:requestOrigin,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 assert.equal((await call('/my-work/')).status,302);assert.equal((await call('/api/work/profile')).status,401);
 const start=await call('/auth/start?next='+encodeURIComponent('/play/?work=keep-me'));assert.equal(start.status,302,await start.clone().text());
 const pending=start.headers.getSetCookie()[0];assert.match(pending,/^__Host-cadavre-login=/);assert.match(pending,/Secure; HttpOnly; SameSite=Lax/);assert.ok(!pending.includes('Domain='));
 const cunyCookie=(await d.issueSessionCookie(config,{subject:'cail-'+'e'.repeat(32),operationalSubject:'cail-v1-'+'f'.repeat(32),authTime:Math.floor(Date.now()/1000)})).split(';')[0];
 const approved=await d.handleWorkerLogin(config,store,new Request(start.headers.get('location'),{headers:{cookie:cunyCookie}}));assert.equal(approved.status,302);
 const callback=new URL(approved.headers.get('location'));assert.equal(callback.origin,origin);
 assert.equal((await call(callback.pathname+callback.search)).status,401);
 assert.equal((await call(callback.pathname+callback.search,{cookie:pending.split(';')[0].replace(/%22state%22%3A%22[^%]+/,'%22state%22%3A%22wrong')})).status,401);assert.equal(redeems,0);
 assert.equal((await call('/auth/callback?state=x&code=x',{cookie:'__Host-cadavre-login=%broken'})).status,401);
 const accepted=await call(callback.pathname+callback.search,{cookie:pending.split(';')[0]});assert.equal(accepted.status,302,await accepted.clone().text());assert.equal(accepted.headers.get('location'),'/play/?work=keep-me');
 const cookies=accepted.headers.getSetCookie();assert.ok(cookies.some(c=>c.startsWith('__Host-cadavre-login=;')&&c.includes('Max-Age=0')));const session=cookies.find(c=>c.startsWith('__Host-cadavre-session=')).split(';')[0];assert.equal(session.split('=')[1].split('.').length,2);assert.equal(accepted.headers.get('referrer-policy'),'no-referrer');
 assert.equal((await call(callback.pathname+callback.search,{cookie:pending.split(';')[0]})).status,401);
 for(const [path,method]of[['/api/work/entries','PUT'],['/auth/logout','POST']])assert.equal((await call(path,{cookie:session,method,body:{},requestOrigin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/work/profile',{cookie:session,extra:{'x-cail-identity-jwt':'forged',authorization:'Bearer forged'}})).status,200);
 const page=await call('/');assert.equal(page.status,200);assert.match(await page.text(),/href="\/play\/"/);
 assert.equal((await call('/play/')).status,200);
 const configuration=await(await call('/play/config.local.js',{cookie:session})).text();assert.match(configuration,/workEndpoint: "\/api\/work"/);assert.ok(!configuration.includes('/cadavre/api/'));
 const id=crypto.randomUUID();let r=await call('/api/cadavre/chat',{cookie:session,method:'POST',body:{model:'test/poetry',stream:false,workId:id,messages:[{role:'user',content:'Paper lantern'}]}});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).workModelRecorded,true);
 r=await call('/api/work/entries',{cookie:session,method:'PUT',body:{id,app:'cadavre',kind:'poem',title:'Worker lantern',expectedRevision:0,content:{schemaVersion:1,contributions:[{role:'user',content:'Paper lantern'},{role:'assistant',content:'A lantern drifts.',model:'test/poetry'}],text:'Paper lantern\nA lantern drifts.',reading:'',settings:{},record:{}}}});assert.equal(r.status,201,await r.clone().text());
 const dashboard=await(await call('/my-work/api/dashboard',{cookie:session})).json();assert.equal(dashboard.apps.cadavre.recent[0].id,id);
 const catalog=await(await call('/my-work/api/applications',{cookie:session})).json();assert.equal(catalog.applications[0].resumePath,origin+'/play/');
 assert.equal((await call('/my-work/api/reflection',{cookie:session,method:'POST',body:{}})).status,404);assert.equal(modelCalls,1);
 assert.equal((await call('/auth/logout',{cookie:session,method:'POST'})).status,302);assert.equal((await call('/api/work/profile',{cookie:session})).status,401);
 console.log('PASS: Worker origin login/callback guards, host-only cookies, one-use code, origin checks, forged-header removal, real account save and dashboard, Worker resume URL, and logout revocation. Local identity/model doubles.');
}finally{await mf.dispose();await rm(temporary,{recursive:true,force:true});}

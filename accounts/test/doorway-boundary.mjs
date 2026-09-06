// Real caller and receivers; local session key, Admission and model doubles.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK} from 'jose';
// Node requires duplex for streamed bodies; Workers' Request supplies it.
const NodeRequest=globalThis.Request;globalThis.Request=class extends NodeRequest{constructor(input,init){super(input,init?.body?{...init,duplex:'half'}:init);}};
const source=process.env.DOORWAY_SOURCE;if(!source)throw new Error('Set DOORWAY_SOURCE to the reviewed Doorway checkout');
const temporary=await mkdtemp(join(tmpdir(),'cail-boundary-'));
const output=join(temporary,'doorway.mjs');
await build({stdin:{contents:`export {handleDoorwayRequest} from './src/doorway.ts';export {parsePolicy} from './src/policy.ts';export {ADMISSION_CONTRACT} from './src/admission-contract.ts';export {issueSessionCookie} from './src/session.ts';`,resolveDir:resolve(source)},bundle:true,platform:'node',format:'esm',outfile:output});
const {handleDoorwayRequest,parsePolicy,issueSessionCookie,ADMISSION_CONTRACT}=await import(pathToFileURL(output).href);
const origin='https://tools.ailab.gc.cuny.edu';
const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:'boundary-test',alg:'RS256',use:'sig'});
const jwksJson=JSON.stringify({keys:[jwk]});
let calls=0;const admission={name:'admission',entrypoint:'AdmissionResolver'};
const membership={ok:true,expiresAt:'2099-01-01T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};
const gateway=async request=>{calls++;const b=await request.json();return Response.json({model:b.model,choices:[{message:{content:'The lantern follows the river.'}}]});};
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
{name:'router',modules:true,compatibilityDate:'2026-09-06',script:`export default {fetch(r,e){return(new URL(r.url).pathname.startsWith('/cadavre')?e.CADAVRE:e.HUB).fetch(r);}}`,serviceBindings:{CADAVRE:'cadavre',HUB:'accounts'}},
{name:'accounts',modules:true,compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat','enable_request_signal'],scriptPath:'dist/index.js',bindings:{CAIL_IDENTITY_JWKS:jwksJson,RELEASE:'boundary-test'},d1Databases:['DB'],durableObjects:{ACCOUNTS:{className:'AccountCoordinator',useSQLite:true}},serviceBindings:{ADMISSION_RESOLVER:admission,GATEWAY:gateway}},
{name:'cadavre',modules:true,compatibilityDate:'2026-09-06',scriptPath:resolve('../worker/dist-worker/index.js'),modulesRoot:resolve('..'),bindings:{CAIL_IDENTITY_JWKS:jwksJson,CADAVRE_DEFAULT_MODEL:'test/poetry',RELEASE:'boundary-test'},durableObjects:{STORE:{className:'CadavreStore',useSQLite:true}},serviceBindings:{WORK_ACCOUNTS:{name:'accounts',entrypoint:'CadavreAccounts'},ADMISSION_RESOLVER:admission,GATEWAY:gateway,ASSETS:async()=>new Response('asset fixture')}},
{name:'admission',modules:true,compatibilityDate:'2026-09-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class AdmissionResolver extends WorkerEntrypoint{resolveMembership(){return ${JSON.stringify(membership)};}}export default{fetch(){return new Response();}}`}
]}));
try{
 const db=await mf.getD1Database('DB','accounts');for(const sql of ((await Promise.all(['0001_accounts.sql','0002_application_catalog.sql'].map(file=>readFile('migrations/'+file,'utf8')))).join('\n')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const receiver={fetch:async(input,init)=>{try{const request=new Request(input,{...init,duplex:'half'});assert.equal(request.headers.get('cookie'),null);assert.notEqual(request.headers.get('x-cail-identity-jwt'),'forged');return await mf.dispatchFetch(request.url,{method:request.method,headers:request.headers,body:request.body,duplex:'half'});}catch(error){console.error('Local receiver:',error.message);throw error;}}};
 const config={admissionContract:ADMISSION_CONTRACT,canonicalOrigin:origin,policy:parsePolicy(JSON.parse(await readFile(join(source,'config/route-policy.json'),'utf8'))),identity:{signingKey:privateKey,signingKid:'boundary-test',jwksJson,ownershipSalt:'local-only',operationalSalt:'local-only'},session:{secret:crypto.getRandomValues(new Uint8Array(32)),idleSeconds:86400,absoluteSeconds:604800},admissionResolver:{resolveMembership:async()=>membership},cadavre:receiver,workAccounts:receiver};
 const cookie=(await issueSessionCookie(config,{subject:'cail-'+'e'.repeat(32),operationalSubject:'cail-v1-'+'f'.repeat(32),authTime:Math.floor(Date.now()/1000)})).split(';')[0];
 const call=(path,method='GET',body)=>handleDoorwayRequest(config,new Request(origin+path,{method,headers:{cookie,origin,'content-type':'application/json','x-cail-identity-jwt':'forged','x-cail-gateway-identity-jwt':'forged'},body:body===undefined?undefined:JSON.stringify(body)}));
 const id=crypto.randomUUID();
 let response=await call('/cadavre/api/cadavre/chat','POST',{model:'test/poetry',stream:false,workId:id,messages:[{role:'user',content:'Paper lantern'}]});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).workModelRecorded,true);
 response=await call('/cadavre/api/work/entries','PUT',{id,app:'cadavre',kind:'poem',title:'Boundary lantern',expectedRevision:0,content:{schemaVersion:1,contributions:[{role:'user',content:'Paper lantern'},{role:'assistant',content:'The lantern follows the river.',model:'test/poetry'}],text:'Paper lantern\nThe lantern follows the river.',reading:'',settings:{},record:{}}});assert.equal(response.status,201,await response.clone().text());
 const dashboard=await (await call('/my-work/api/dashboard')).json();assert.equal(dashboard.apps.cadavre.recent[0].id,id);assert.equal(dashboard.lastModel.model,'test/poetry');
 response=await call('/my-work/api/reflection','POST',{});assert.equal(response.status,404,await response.clone().text());assert.equal(calls,1);
 assert.equal((await call('/my-work/api/entries/'+id)).status,200);
 console.log('PASS: real Doorway session -> matching identities -> Cadavre inference -> account RPC -> D1/DO save -> hub readback; reflection unavailable; exactly one model call.');
}finally{await mf.dispose();await rm(temporary,{recursive:true,force:true});}

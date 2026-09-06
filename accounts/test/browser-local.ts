// Local-only acceptance: real product Workers + D1 + DO; local JWT issuer,
// Admission and model provider doubles. Never deploy this caller.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const origin='https://tools.ailab.gc.cuny.edu';
const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
const jwk=await exportJWK(publicKey);jwk.kid='local-browser';jwk.alg='RS256';jwk.use='sig';
const tokens:Record<string,string>={};
for(const app of ['work-accounts','cadavre','gateway'])tokens[app]=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'local-browser'}).setIssuer(origin+'/cail-sso').setSubject('cail-'+'d'.repeat(32)).setAudience('cail:'+app).setIssuedAt().setExpirationTime('2h').sign(privateKey);
const common={CAIL_IDENTITY_JWKS:JSON.stringify({keys:[jwk]}),RELEASE:'local-browser'};
const admission={name:'admission',entrypoint:'AdmissionResolver'};
async function gateway(request:Request){
 if(request.method==='GET')return Response.json({data:[{id:'test/poetry',provider:'local-test',capabilities:['text-generation']}]});
 const body=await request.json() as {messages:{content:string}[];model:string};
 const reflection=body.messages[0]?.content.startsWith('Reflect on recent');
 const reading=body.messages.some(m=>m.content.includes('close reading'));
 return Response.json({model:body.model,choices:[{message:{role:'assistant',content:reflection?'In “Paper lantern,” the image of light changes scale as the poem develops. Your contributions bring objects into motion; try holding one object still in the next piece.':reading?'The poem turns a small light into a direction of travel.':'drifts home'}}],usage:{completion_tokens:5}});
}
const mf=new Miniflare(convertV4MiniflareOptions({port:8792,workers:[
 {name:'local-caller',modules:true,compatibilityDate:'2026-09-06',script:`export default {fetch(r,e){const u=new URL(r.url);const app=u.pathname.startsWith('/cadavre')?'cadavre':'work-accounts';const h=new Headers(r.headers);if(h.get('origin')===u.origin)h.set('origin','${origin}');h.set('x-cail-identity-jwt',app==='cadavre'?e.CADAVRE_JWT:e.HUB_JWT);h.set('x-cail-gateway-identity-jwt',e.GATEWAY_JWT);u.protocol='https:';u.host='tools.ailab.gc.cuny.edu';return (app==='cadavre'?e.CADAVRE:e.HUB).fetch(new Request(u,{method:r.method,headers:h,body:r.body,redirect:'manual'}));}}`,bindings:{CADAVRE_JWT:tokens.cadavre,HUB_JWT:tokens['work-accounts'],GATEWAY_JWT:tokens.gateway},serviceBindings:{CADAVRE:'cadavre',HUB:'accounts'}},
 {name:'accounts',modules:true,compatibilityDate:'2026-09-06',compatibilityFlags:['nodejs_compat','enable_request_signal'],scriptPath:'dist/index.js',bindings:common,d1Databases:['DB'],durableObjects:{ACCOUNTS:{className:'AccountCoordinator',useSQLite:true}},serviceBindings:{ADMISSION_RESOLVER:admission,GATEWAY:gateway}},
 {name:'cadavre',modules:true,compatibilityDate:'2026-08-25',scriptPath:resolve('../worker/dist-worker/index.js'),modulesRoot:resolve('..'),bindings:{...common,CADAVRE_DEFAULT_MODEL:'test/poetry',CADAVRE_MODEL_POLICY:'workers-ai'},durableObjects:{STORE:{className:'CadavreStore',useSQLite:true}},serviceBindings:{WORK_ACCOUNTS:{name:'accounts',entrypoint:'CadavreAccounts'},ADMISSION_RESOLVER:admission,GATEWAY:gateway,ASSETS:async(request:Request)=>{
  const pathname=new URL(request.url).pathname;const file=resolve('../worker/dist','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(resolve('../worker/dist')+'/'))return new Response('Not found',{status:404});
  try{return new Response(await readFile(file),{headers:{'content-type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'} as Record<string,string>)[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
 }}},
 {name:'admission',modules:true,compatibilityDate:'2026-09-06',script:`import {WorkerEntrypoint} from 'cloudflare:workers';export class AdmissionResolver extends WorkerEntrypoint{resolveMembership(){return {ok:true,expiresAt:'2099-01-01T00:00:00.000Z',revision:1,accessRole:'member',budgetScope:'person'};}}export default{fetch(){return new Response('local admission double');}}`},
]}));
const db=await mf.getD1Database('DB','accounts');
const schema=await readFile('migrations/0001_accounts.sql','utf8');for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
console.log('Local acceptance ready: '+await mf.ready);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void mf.dispose().then(()=>process.exit()));

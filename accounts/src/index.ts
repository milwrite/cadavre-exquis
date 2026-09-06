import { WorkerEntrypoint } from 'cloudflare:workers';
import { authenticate, AuthFailure, boundedJson, enforceOrigin, type AuthBindings } from './auth.ts';
import { InputError, type AppId } from './contract.ts';
import { page } from './ui.ts';
import { manifest, registerWorker, workerCatalog, LAB_LINKS } from './applications.ts';
export { AccountCoordinator } from './store.ts';
type Bindings = Env & AuthBindings;
const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function respond(value:{status:number;json:string}) {return new Response(value.json,{status:value.status,headers:{...headers,'content-type':'application/json'}});}
async function handle(request:Request,env:Bindings,scope:AppId|null):Promise<Response> {
  try {
    const url=new URL(request.url);
    enforceOrigin(request);
    const audience = scope ? `cail:${scope}` : 'cail:work-accounts';
    const path = scope ? url.pathname.replace(/^\/api\/work/,'') : url.pathname.replace(/^\/my-work\/api/,'');
    const {subject}=await authenticate(request,env,audience);
    const store=env.ACCOUNTS.getByName(subject);
    if (path==='/applications' && request.method==='GET') return Response.json({applications:await workerCatalog(env.DB,scope),labLinks:scope?[]:LAB_LINKS},{headers});
    if (!scope && ['/my-work','/my-work/'].includes(url.pathname) && request.method==='GET') return new Response(page,{headers:{...headers,'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
    const input = ['GET','HEAD'].includes(request.method) ? null : await boundedJson(request);
    return respond(await store.run(subject,scope,request.method,path,input,url.search));
  }catch(error){
    if(error instanceof AuthFailure) return error.response;
    if(error instanceof InputError) return Response.json({error:{code:'invalid_request',message:error.message}},{status:400,headers});
    console.error(JSON.stringify({event:'accounts.request.failed'}));
    return Response.json({error:{code:'service_unavailable',message:'Your work is temporarily unavailable. Try again.'}},{status:503,headers});
  }
}
export class WorkerAccounts extends WorkerEntrypoint<Bindings> {
  get app():AppId {return manifest(this.ctx.props).id;}
  register(){return registerWorker(this.env.DB,this.ctx.props);}
  async fetch(request:Request){await this.register();return handle(request,this.env,this.app);}
  async beginModel(appJwt:string){
    await this.register();
    const request=new Request('https://tools.ailab.gc.cuny.edu/',{headers:{'x-cail-identity-jwt':appJwt}});
    const {subject}=await authenticate(request,this.env,`cail:${this.app}`);
    const result=await this.env.ACCOUNTS.getByName(subject).run(subject,this.app,'GET','/profile',null,'');
    if(result.status!==200)throw new Error('Account unavailable');
    return {generation:(JSON.parse(result.json) as {profile:{createdAt:number}}).profile.createdAt};
  }
  async modelCompleted(appJwt:string,model:string,entryId:string|null,generation:number){
    await this.register();
    const request=new Request('https://tools.ailab.gc.cuny.edu/',{headers:{'x-cail-identity-jwt':appJwt}});
    const {subject}=await authenticate(request,this.env,`cail:${this.app}`);
    return {recorded:await this.env.ACCOUNTS.getByName(subject).modelCompleted(subject,this.app,model,entryId,generation)};
  }
}
// Compatibility receiver retained only until the already-deployed caller switches.
export class CadavreAccounts extends WorkerAccounts {
  get app(){return 'cadavre';}
  async register(){return {registered:true,id:this.app,version:0};}
}
export default {fetch(request:Request,env:Bindings){return handle(request,env,null);}};

import { authenticate, AuthFailure, boundedJson, enforceOrigin, ORIGIN, type AuthBindings } from '../../accounts/src/auth.ts';
import { boundedText, entryId, exact, InputError, isRecord } from '../../accounts/src/contract.ts';
import { configScript } from './config.ts';
export type AccountClient = {fetch(request:Request):Promise<Response>;beginModel(jwt:string):Promise<{generation:number}>;modelCompleted(jwt:string,model:string,entryId:string|null,generation:number):Promise<{recorded:boolean}>};
export type SignedBindings = Env & AuthBindings & {WORK_ACCOUNTS:AccountClient};
const noStore={'cache-control':'no-store','x-content-type-options':'nosniff'};
export async function signedIn(request:Request,env:SignedBindings,legacy:(request:Request)=>Promise<Response>):Promise<Response> {
  const url=new URL(request.url);
  const path=url.pathname.slice('/cadavre'.length)||'/';
  try{
    enforceOrigin(request);
    const inference=path==='/api/cadavre/chat';
    const {keyring}=await authenticate(request,env,'cail:cadavre',inference);
    if(url.pathname==='/cadavre')return Response.redirect(ORIGIN+'/cadavre/',302);
    const internal=new URL(request.url);internal.pathname=path;
    const translated=new Request(internal,request);
    if(path.startsWith('/api/work/'))return env.WORK_ACCOUNTS.fetch(translated);
    if(path==='/ui/config.local.js')return new Response(configScript(env.CADAVRE_DEFAULT_MODEL,true),{headers:{...noStore,'content-type':'application/javascript'}});
    if(path==='/api/cadavre/models'){
      const response=await env.GATEWAY.fetch(ORIGIN+'/v1/catalog',{signal:request.signal});
      if(!response.ok)return Response.json({error:{code:'catalog_unavailable',message:'The model list could not be loaded.'}},{status:503,headers:noStore});
      const value=await response.json() as {data:{id:string;provider:string;capabilities?:string[]}[]};
      const models=value.data.filter(m=>m.capabilities?.includes('text-generation')).map(m=>({id:m.id,model:m.id,label:m.id,provider:m.provider,available:true}));
      return Response.json({default:env.CADAVRE_DEFAULT_MODEL,models},{headers:noStore});
    }
    if(inference){
      const input=exact(await boundedJson(request),['model','messages','temperature','top_p','max_tokens','stream','workId','recordModel']);
      const model=boundedText(input.model,180,true);
      if(!Array.isArray(input.messages)||input.messages.length<1||input.messages.length>300||input.stream!==false)throw new InputError('Invalid model request.');
      for(const m of input.messages){if(!isRecord(m)||!['system','user','assistant'].includes(String(m.role)))throw new InputError('Invalid message.');boundedText(m.content,50000,true);}
      const workId=input.workId===undefined?null:entryId(input.workId);
      const {workId:_id,recordModel:_record,...body}=input;
      const observation=input.recordModel===false?null:await env.WORK_ACCOUNTS.beginModel(keyring.appJwt);
      const upstream=await env.GATEWAY.fetch(ORIGIN+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${keyring.gatewayJwt}`,'x-request-id':crypto.randomUUID()},body:JSON.stringify({...body,messages:input.messages.map(m=>({role:m.role,content:m.content}))}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
      if(!upstream.ok)return upstream;
      const data=await upstream.json() as {model?:string;choices?:{message?:{content?:string}}[]};
      let recorded=false;
      // Auxiliary cue requests explicitly opt out. The model observation is
      // produced server-side after a real successful model completion.
      if(input.recordModel!==false && data.choices?.[0]?.message?.content){
        try{const saved=await env.WORK_ACCOUNTS.modelCompleted(keyring.appJwt,data.model||model,workId,observation!.generation);recorded=saved.recorded;}catch{/* Preserve the generated turn; report the missing record to the browser. */}
      }
      return Response.json({...data,workModelRecorded:recorded},{headers:noStore});
    }
    if(path.startsWith('/api/'))return legacy(translated);
    const asset=await env.ASSETS.fetch(translated);
    return new Response(asset.body,{status:asset.status,headers:{...Object.fromEntries(asset.headers),...noStore}});
  }catch(error){
    if(error instanceof AuthFailure)return error.response;
    if(error instanceof InputError)return Response.json({error:{code:'invalid_request',message:error.message}},{status:400,headers:noStore});
    return Response.json({error:{code:'service_unavailable',message:'Cadavre is temporarily unavailable. Try again.'}},{status:503,headers:noStore});
  }
}

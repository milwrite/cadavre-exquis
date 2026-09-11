import { authenticate, AuthFailure, boundedJson, enforceOrigin, ORIGIN, type AuthBindings } from '../../accounts/src/auth.ts';
import { boundedText, entryId, exact, InputError, isRecord } from '../../accounts/src/contract.ts';
import { configScript } from './config.ts';
import { bindingModel, fetchGatewayModels } from './catalog.ts';
import { THINKING_OFF } from './shape.ts';
export type AccountClient = {register():Promise<{registered:boolean;id:string;version:number}>;fetch(request:Request):Promise<Response>;beginModel(jwt:string):Promise<{generation:number}>;modelCompleted(jwt:string,model:string,entryId:string|null,generation:number):Promise<{recorded:boolean}>};
export type SignedBindings = Env & AuthBindings & {WORK_ACCOUNTS:AccountClient};
const noStore={'cache-control':'no-store','x-content-type-options':'nosniff'};
export async function signedIn(request:Request,env:SignedBindings,legacy:(request:Request)=>Promise<Response>):Promise<Response> {
  const url=new URL(request.url);
  const path=url.pathname.slice('/cadavre'.length)||'/';
  try{
    enforceOrigin(request);
    const inference=path==='/api/cadavre/chat';
    const {keyring}=await authenticate(request,env,'cail:cadavre',inference);
    await env.WORK_ACCOUNTS.register();
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
      const selectedModel=boundedText(input.model,180,true);
      const catalog=await fetchGatewayModels(env.CAIL_CATALOG_URL,request.signal);
      const route=catalog.find(m=>m.id===selectedModel || m.provider==='workers-ai'&&bindingModel(m.id)===selectedModel);
      if(!route)return Response.json({error:{message:'This model is no longer available. Choose another model.'}},{status:404,headers:noStore});
      const model=route.id;
      if(!Array.isArray(input.messages)||input.messages.length<1||input.messages.length>300||input.stream!==false)throw new InputError('Invalid model request.');
      for(const m of input.messages){if(!isRecord(m)||!['system','user','assistant'].includes(String(m.role)))throw new InputError('Invalid message.');boundedText(m.content,50000,true);}
      const workId=input.workId===undefined?null:entryId(input.workId);
      const {workId:_id,recordModel:_record,...body}=input;
      const observation=input.recordModel===false?null:await env.WORK_ACCOUNTS.beginModel(keyring.appJwt);
      const upstream=await env.GATEWAY.fetch(ORIGIN+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${keyring.gatewayJwt}`,'x-request-id':crypto.randomUUID()},body:JSON.stringify({...body,model,...(route.capabilities?.includes('reasoning')?THINKING_OFF[route.provider||'']:{}),messages:input.messages.map(m=>({role:m.role,content:m.content}))}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
      if(!upstream.ok)return upstream;
      const data=await upstream.json() as {model?:string;choices?:{message?:{content?:string}}[]};
      if(!data.choices?.[0]?.message?.content?.trim())return Response.json({error:{message:'The model returned no visible text. Try another model.'}},{status:502,headers:noStore});
      let recorded=false;
      // Auxiliary cue requests explicitly opt out. The model observation is
      // produced server-side after a real successful model completion.
      if(input.recordModel!==false && data.choices?.[0]?.message?.content){
        try{const saved=await env.WORK_ACCOUNTS.modelCompleted(keyring.appJwt,data.model||model,workId,observation!.generation);recorded=saved.recorded;}catch{/* Preserve the generated turn; report the missing record to the browser. */}
      }
      return Response.json({...data,workModelRecorded:recorded},{headers:noStore});
    }
    if(path.startsWith('/api/'))return legacy(translated);
    // The stable Worker route serves the existing sheet. Resolve asset clean-URL
    // redirects internally so the browser never loses its authenticated mount.
    if(path==='/play')return Response.redirect(ORIGIN+'/cadavre/play/'+url.search,302);
    const assetUrl=new URL(translated.url);
    if(path==='/play/' || path==='/play/config.local.js') {
      if(path.endsWith('config.local.js'))return new Response(configScript(env.CADAVRE_DEFAULT_MODEL,true),{headers:{...noStore,'content-type':'application/javascript'}});
      assetUrl.pathname='/ui/corpse';
    }
    let asset=await env.ASSETS.fetch(new Request(assetUrl,translated));
    const location=asset.headers.get('location');
    if(location && asset.status>=300 && asset.status<400){
      const target=new URL(location,assetUrl);
      if(target.origin!==assetUrl.origin)return Response.json({error:{code:'invalid_asset_redirect'}},{status:502});
      return Response.redirect(ORIGIN+'/cadavre'+target.pathname+target.search+target.hash,asset.status);
    }
    if(asset.headers.get('content-type')?.includes('text/html'))asset=new HTMLRewriter().on('a[href]',{element(el){const href=el.getAttribute('href');if(href && new URL(href,assetUrl).pathname==='/ui/corpse.html')el.setAttribute('href','/cadavre/play/');}}).transform(asset);
    return new Response(asset.body,{status:asset.status,headers:{...Object.fromEntries(asset.headers),...noStore,'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
  }catch(error){
    if(error instanceof AuthFailure)return error.response;
    if(error instanceof InputError)return Response.json({error:{code:'invalid_request',message:error.message}},{status:400,headers:noStore});
    return Response.json({error:{code:'service_unavailable',message:'Cadavre is temporarily unavailable. Try again.'}},{status:503,headers:noStore});
  }
}

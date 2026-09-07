import { configScript } from './config.ts';
import { signedIn, type SignedBindings } from './signed-in.ts';
import { ORIGIN } from '../../accounts/src/auth.ts';
import { createCailAuthError, serializeCailAuthError } from '@cuny-ai-lab/cail-identity';

type IdentityResult={ok:true;appJwt:string;gatewayJwt:string;workspaceJwt:string|null}|{ok:false;status:number};
type IdentityClient={begin(challenge:string,state:string):Promise<{url:string}>;redeem(code:string,verifier:string):Promise<{ok:true;token:string;expiresAt:number}|{ok:false;status:number}>;identities(token:string):Promise<IdentityResult>;revoke(token:string):Promise<unknown>};
export type WorkerOriginBindings=SignedBindings & {PUBLIC_ORIGIN?:string;IDENTITY:IdentityClient;WORKSPACE:{fetch(request:Request):Promise<Response>}};
const sessionCookie='__Host-cadavre-session', loginCookie='__Host-cadavre-login';
const secure={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
const cookie=(name:string,value:string,seconds:number)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
function readCookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
function redirect(location:string,cookies:string[]=[]){const headers=new Headers({...secure,location});for(const c of cookies)headers.append('set-cookie',c);return new Response(null,{status:302,headers});}
function failure(status=401){const code=status===403?'admission_required':status===401?'authentication_required':'admission_unavailable';return new Response(serializeCailAuthError(createCailAuthError(code,status===403?'Active CAIL access is required.':status===401?'Sign in with CUNY to open your work.':'Sign-in is temporarily unavailable. Try again.','/auth/start')),{status,headers:{...secure,'content-type':'application/json'}});}
const safeNext=(value:string|null)=>typeof value==='string' && value.length<500 && /^\/(?:my-work(?:\/|\?|#|$)|play(?:\/|\?|#|$)|ui\/corpse(?:\.html|\/|\?|#|$)|\?|$)/.test(value) && !/[\\\r\n]/.test(value)?value:'/my-work/';
function forward(request:Request,path:string,identity:IdentityResult & {ok:true},hub=false){
  const url=new URL(request.url);url.protocol='https:';url.host=new URL(ORIGIN).host;url.pathname=path;
  const headers=new Headers(request.headers);
  for(const name of [...headers.keys()])if(name==='cookie'||name==='authorization'||name.startsWith('x-cail-'))headers.delete(name);
  if(headers.has('origin'))headers.set('origin',ORIGIN);
  headers.set('x-cail-identity-jwt',hub?identity.workspaceJwt!:identity.appJwt);
  if(!hub)headers.set('x-cail-gateway-identity-jwt',identity.gatewayJwt);
  return new Request(url,{method:request.method,headers,body:request.body,redirect:'manual',signal:request.signal});
}
export async function atWorkerOrigin(request:Request,env:WorkerOriginBindings,legacy:(request:Request)=>Promise<Response>):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(!['GET','HEAD','OPTIONS'].includes(request.method) && (request.headers.get('origin')!==env.PUBLIC_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'))return Response.json({error:{code:'origin_rejected',message:'Reload this page from Cadavre.'}},{status:403,headers:secure});
  const token=readCookie(request,sessionCookie);
  try{
    if(path==='/health')await env.WORK_ACCOUNTS.register();
    if(path==='/auth/start'){
      if(request.method!=='GET')return new Response(null,{status:405,headers:secure});
      const limited=await env.TURN_LIMIT.limit({key:'login:'+request.headers.get('cf-connecting-ip')});if(!limited.success)return new Response('Try signing in again shortly.',{status:429,headers:secure});
      const verifier=random(),state=random(),challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
      const result=await env.IDENTITY.begin(challenge,state);
      const target=new URL(result.url);if(target.origin!==ORIGIN||target.pathname!=='/worker-login')throw new Error('Invalid sign-in destination');
      return redirect(result.url,[cookie(loginCookie,encodeURIComponent(JSON.stringify({verifier,state,next:safeNext(url.searchParams.get('next'))})),600)]);
    }
    if(path==='/auth/callback'){
      if(request.method!=='GET')return new Response(null,{status:405,headers:secure});
      const raw=readCookie(request,loginCookie);if(!raw||raw.length>1500)return failure();
      let login:{state:string;verifier:string;next:string};
      try{login=JSON.parse(decodeURIComponent(raw));}catch{return failure();}
      if(!login || typeof login!=='object' || !/^[A-Za-z0-9_-]{43}$/.test(login.verifier) || !/^[A-Za-z0-9_-]{43}$/.test(login.state)||login.state!==url.searchParams.get('state')||!url.searchParams.get('code'))return failure();
      const result=await env.IDENTITY.redeem(url.searchParams.get('code')!,login.verifier);if(!result.ok)return failure(result.status);
      return redirect(safeNext(login.next),[cookie(sessionCookie,result.token,Math.max(0,Math.floor((result.expiresAt-Date.now())/1000))),cookie(loginCookie,'',0)]);
    }
    if(path==='/auth/logout'){
      if(request.method!=='POST')return new Response(null,{status:405,headers:secure});
      if(token)await env.IDENTITY.revoke(token);
      return redirect('/',[cookie(sessionCookie,'',0),cookie(loginCookie,'',0)]);
    }
    if(path==='/ui/config.local.js'||path==='/play/config.local.js')return new Response(configScript(env.CADAVRE_DEFAULT_MODEL,Boolean(token),true),{headers:{...secure,'content-type':'application/javascript'}});
    const hub=path==='/my-work'||path.startsWith('/my-work/');
    const personalApi=path.startsWith('/api/work/')||Boolean(token)&&path.startsWith('/api/cadavre/');
    if(hub||personalApi){
      const identity=token?await env.IDENTITY.identities(token):{ok:false as const,status:401};
      if(!identity.ok){if(identity.status===401 && hub && !path.startsWith('/my-work/api'))return redirect('/auth/start?next='+encodeURIComponent(path+url.search));return failure(identity.status);}
      if(hub){if(!identity.workspaceJwt)return failure(403);return env.WORKSPACE.fetch(forward(request,path,identity,true));}
      return signedIn(forward(request,'/cadavre'+path,identity),env,legacy);
    }
    if(!token && url.searchParams.has('work') && (path==='/'||path==='/play/'||path.startsWith('/ui/corpse')))return redirect('/auth/start?next='+encodeURIComponent(path+url.search));
    if(path==='/play')return redirect('/play/'+url.search);
    if(path==='/play/'){
      const assetUrl=new URL(request.url);assetUrl.pathname='/ui/corpse';
      return env.ASSETS.fetch(new Request(assetUrl,request));
    }
    const response=await (path.startsWith('/api/')||path==='/health'?legacy(request):env.ASSETS.fetch(request));
    if(response.headers.get('content-type')?.includes('text/html'))return new HTMLRewriter().on('a[href]',{element(el){const href=el.getAttribute('href');if(href&&new URL(href,url).pathname==='/ui/corpse.html')el.setAttribute('href','/play/');}}).transform(response);
    return response;
  }catch{return failure(503);}
}
